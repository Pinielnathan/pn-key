from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from .config import DEMUCS_MODEL

# Krumhansl-Kessler key profiles — the standard reference pitch-class weights
# used for correlation-based key estimation from a chroma vector.
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

ANALYZE_DURATION_SECONDS = 60.0


def _estimate_key_index(chroma_mean: np.ndarray) -> int:
    best_score = -np.inf
    best_index = 0
    for shift in range(12):
        major_score = np.corrcoef(chroma_mean, np.roll(_MAJOR_PROFILE, shift))[0, 1]
        minor_score = np.corrcoef(chroma_mean, np.roll(_MINOR_PROFILE, shift))[0, 1]
        score = max(major_score, minor_score)
        if score > best_score:
            best_score = score
            best_index = shift
    return best_index


def analyze(input_path: Path) -> dict:
    """Best-effort BPM and key detection. Meant as a starting point the user can correct."""
    y, sr = librosa.load(str(input_path), sr=None, mono=True, duration=ANALYZE_DURATION_SECONDS)

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.asarray(tempo).reshape(-1)[0])

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_index = _estimate_key_index(chroma.mean(axis=1))

    return {"bpm": round(bpm, 1), "key_index": key_index}


def retune(
    input_path: Path,
    output_path: Path,
    source_bpm: float,
    target_bpm: float,
    semitone_shift: float,
) -> None:
    """Time-stretch audio from source_bpm to target_bpm, then pitch-shift by semitone_shift."""
    y, sr = librosa.load(str(input_path), sr=None, mono=False)
    if y.ndim == 1:
        y = y[np.newaxis, :]

    rate = target_bpm / source_bpm

    channels = []
    for channel in y:
        stretched = librosa.effects.time_stretch(channel, rate=rate) if rate != 1.0 else channel
        shifted = (
            librosa.effects.pitch_shift(stretched, sr=sr, n_steps=semitone_shift)
            if semitone_shift != 0
            else stretched
        )
        channels.append(shifted)

    out = np.stack(channels, axis=0)
    sf.write(str(output_path), out.T, sr)


def separate(input_path: Path, out_dir: Path) -> tuple[Path, Path]:
    """Run Demucs two-stem separation. Returns (vocals_path, instrumental_path)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        "-m",
        "demucs",
        "--two-stems",
        "vocals",
        "-n",
        DEMUCS_MODEL,
        "-o",
        str(out_dir),
        str(input_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Demucs failed: {result.stderr[-4000:]}")

    track_name = input_path.stem
    stem_dir = out_dir / DEMUCS_MODEL / track_name
    vocals_path = stem_dir / "vocals.wav"
    instrumental_path = stem_dir / "no_vocals.wav"
    if not vocals_path.exists() or not instrumental_path.exists():
        raise RuntimeError("Demucs did not produce the expected output files")
    return vocals_path, instrumental_path
