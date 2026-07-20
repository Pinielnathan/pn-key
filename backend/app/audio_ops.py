from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from mutagen.id3 import TBPM, TIT2, TKEY
from mutagen.wave import WAVE

from . import effects
from .config import DEMUCS_MODEL

# Krumhansl-Kessler key profiles — the standard reference pitch-class weights
# used for correlation-based key estimation from a chroma vector.
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

ANALYZE_DURATION_SECONDS = 60.0


def _estimate_key(chroma_mean: np.ndarray) -> tuple[int, bool]:
    """Returns (pitch-class index 0-11, is_minor)."""
    best_score = -np.inf
    best_index = 0
    best_is_minor = False
    for shift in range(12):
        major_score = np.corrcoef(chroma_mean, np.roll(_MAJOR_PROFILE, shift))[0, 1]
        minor_score = np.corrcoef(chroma_mean, np.roll(_MINOR_PROFILE, shift))[0, 1]
        if major_score > best_score:
            best_score, best_index, best_is_minor = major_score, shift, False
        if minor_score > best_score:
            best_score, best_index, best_is_minor = minor_score, shift, True
    return best_index, best_is_minor


def key_name(index: int, is_minor: bool) -> str:
    return f"{_NOTE_NAMES[index % 12]}{'m' if is_minor else ''}"


def analyze(input_path: Path) -> dict:
    """Best-effort BPM and key detection. Meant as a starting point the user can correct."""
    y, sr = librosa.load(str(input_path), sr=None, mono=True, duration=ANALYZE_DURATION_SECONDS)

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.asarray(tempo).reshape(-1)[0])

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_index, is_minor = _estimate_key(chroma.mean(axis=1))

    return {"bpm": round(bpm, 1), "key_index": key_index, "key_name": key_name(key_index, is_minor)}


def embed_metadata(path: Path, bpm: float, key_name_str: str, title: str = "PN Key") -> None:
    """Writes BPM/key as standard ID3 TBPM/TKEY frames — the same tags DJ software reads."""
    audio = WAVE(str(path))
    if audio.tags is None:
        audio.add_tags()
    audio.tags.add(TBPM(encoding=3, text=[str(round(bpm))]))
    audio.tags.add(TKEY(encoding=3, text=[key_name_str]))
    audio.tags.add(TIT2(encoding=3, text=[title]))
    audio.save()


def _tag_with_detected_metadata(path: Path, title: str) -> None:
    result = analyze(path)
    embed_metadata(path, result["bpm"], result["key_name"], title=title)


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
    _tag_with_detected_metadata(output_path, title="PN Key - Retuned vocal")


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

    # Both stems share one song's tempo/key — detect once on the instrumental
    # (fuller harmonic/rhythmic content, more reliable than isolated vocals)
    # and tag both files with it.
    detected = analyze(instrumental_path)
    embed_metadata(vocals_path, detected["bpm"], detected["key_name"], title="PN Key - Vocals")
    embed_metadata(instrumental_path, detected["bpm"], detected["key_name"], title="PN Key - Instrumental")
    return vocals_path, instrumental_path


def apply_effect(input_path: Path, output_path: Path, preset_slug: str) -> None:
    """Runs a named pedalboard preset over the upload and writes a tagged WAV."""
    y, sr = librosa.load(str(input_path), sr=None, mono=False)
    if y.ndim == 1:
        y = y[np.newaxis, :]

    processed = effects.apply_preset(preset_slug, y.astype(np.float32), sr)
    sf.write(str(output_path), processed.T, sr)
    _tag_with_detected_metadata(output_path, title="PN Key - Effect")
