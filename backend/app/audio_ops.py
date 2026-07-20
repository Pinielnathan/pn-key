from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from .config import DEMUCS_MODEL


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
