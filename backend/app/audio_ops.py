from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import lameenc
import librosa
import numpy as np
import soundfile as sf
from mutagen.id3 import TBPM, TIT2, TKEY
from mutagen.mp3 import MP3
from mutagen.wave import WAVE

from . import effects
from .config import DEMUCS_MODEL

# Krumhansl-Kessler key profiles — the standard reference pitch-class weights
# used for correlation-based key estimation from a chroma vector.
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

ANALYZE_DURATION_SECONDS = 60.0
PREVIEW_DURATION_SECONDS = 8.0


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


def _write_id3_tags(mutagen_file, bpm: float, key_name_str: str, title: str) -> None:
    if mutagen_file.tags is None:
        mutagen_file.add_tags()
    mutagen_file.tags.add(TBPM(encoding=3, text=[str(round(bpm))]))
    mutagen_file.tags.add(TKEY(encoding=3, text=[key_name_str]))
    mutagen_file.tags.add(TIT2(encoding=3, text=[title]))
    mutagen_file.save()


def embed_metadata(path: Path, bpm: float, key_name_str: str, title: str = "PN Key") -> None:
    """Writes BPM/key as standard ID3 TBPM/TKEY frames on a WAV file — the same tags DJ software reads."""
    _write_id3_tags(WAVE(str(path)), bpm, key_name_str, title)


def embed_metadata_mp3(path: Path, bpm: float, key_name_str: str, title: str = "PN Key") -> None:
    """Same tags as embed_metadata, for an MP3 file."""
    _write_id3_tags(MP3(str(path)), bpm, key_name_str, title)


def encode_mp3(audio: np.ndarray, sample_rate: int, bit_rate: int = 192) -> bytes:
    """audio: float32 array shaped (channels, samples), range [-1, 1]."""
    if audio.ndim == 1:
        audio = audio[np.newaxis, :]
    channels = audio.shape[0]
    interleaved = np.clip(audio.T, -1.0, 1.0)
    pcm16 = (interleaved * 32767.0).astype("<i2")

    encoder = lameenc.Encoder()
    encoder.silence()
    encoder.set_bit_rate(bit_rate)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(channels)
    encoder.set_quality(2)
    data = bytes(encoder.encode(pcm16.tobytes())) + bytes(encoder.flush())
    return data


def _write_wav_and_mp3(
    audio: np.ndarray,
    sample_rate: int,
    wav_path: Path,
    title: str,
) -> tuple[dict[str, Path], dict]:
    """Writes a WAV, detects its BPM/key, tags both a WAV and an MP3 sibling with it."""
    sf.write(str(wav_path), audio.T, sample_rate)
    detected = analyze(wav_path)
    embed_metadata(wav_path, detected["bpm"], detected["key_name"], title=title)

    mp3_path = wav_path.with_suffix(".mp3")
    mp3_path.write_bytes(encode_mp3(audio, sample_rate))
    embed_metadata_mp3(mp3_path, detected["bpm"], detected["key_name"], title=title)

    return {"wav": wav_path, "mp3": mp3_path}, {**detected, "title": title}


def _time_stretch_and_shift(y: np.ndarray, sr: int, rate: float, semitone_shift: float) -> np.ndarray:
    channels = []
    for channel in y:
        stretched = librosa.effects.time_stretch(channel, rate=rate) if rate != 1.0 else channel
        shifted = (
            librosa.effects.pitch_shift(stretched, sr=sr, n_steps=semitone_shift)
            if semitone_shift != 0
            else stretched
        )
        channels.append(shifted)
    return np.stack(channels, axis=0)


def retune(
    input_path: Path,
    output_path: Path,
    source_bpm: float,
    target_bpm: float,
    semitone_shift: float,
) -> tuple[dict[str, Path], dict]:
    """Time-stretch audio from source_bpm to target_bpm, then pitch-shift by semitone_shift."""
    y, sr = librosa.load(str(input_path), sr=None, mono=False)
    if y.ndim == 1:
        y = y[np.newaxis, :]

    rate = target_bpm / source_bpm
    out = _time_stretch_and_shift(y, sr, rate, semitone_shift)
    return _write_wav_and_mp3(out, sr, output_path, title="PN Key - Retuned vocal")


def preview_retune(input_path: Path, source_bpm: float, target_bpm: float, semitone_shift: float) -> bytes:
    """Fast, short MP3 preview of a retune — no job queue, no persistence."""
    y, sr = librosa.load(str(input_path), sr=None, mono=False, duration=PREVIEW_DURATION_SECONDS)
    if y.ndim == 1:
        y = y[np.newaxis, :]

    rate = target_bpm / source_bpm
    processed = _time_stretch_and_shift(y, sr, rate, semitone_shift)
    return encode_mp3(processed, sr, bit_rate=128)


def separate(input_path: Path, out_dir: Path) -> tuple[dict[str, dict[str, Path]], dict[str, dict]]:
    """Run Demucs two-stem separation. Returns {"vocals": {...}, "instrumental": {...}}."""
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
    # and tag both files (and their MP3 siblings) with it.
    detected = analyze(instrumental_path)

    vocals_audio, sr = sf.read(str(vocals_path), dtype="float32")
    instrumental_audio, _ = sf.read(str(instrumental_path), dtype="float32")
    if vocals_audio.ndim == 1:
        vocals_audio = vocals_audio[:, np.newaxis]
    if instrumental_audio.ndim == 1:
        instrumental_audio = instrumental_audio[:, np.newaxis]

    embed_metadata(vocals_path, detected["bpm"], detected["key_name"], title="PN Key - Vocals")
    embed_metadata(instrumental_path, detected["bpm"], detected["key_name"], title="PN Key - Instrumental")

    vocals_mp3 = vocals_path.with_suffix(".mp3")
    vocals_mp3.write_bytes(encode_mp3(vocals_audio.T, sr))
    embed_metadata_mp3(vocals_mp3, detected["bpm"], detected["key_name"], title="PN Key - Vocals")

    instrumental_mp3 = instrumental_path.with_suffix(".mp3")
    instrumental_mp3.write_bytes(encode_mp3(instrumental_audio.T, sr))
    embed_metadata_mp3(instrumental_mp3, detected["bpm"], detected["key_name"], title="PN Key - Instrumental")

    outputs = {
        "vocals": {"wav": vocals_path, "mp3": vocals_mp3},
        "instrumental": {"wav": instrumental_path, "mp3": instrumental_mp3},
    }
    metadata = {
        "vocals": {**detected, "title": "PN Key - Vocals"},
        "instrumental": {**detected, "title": "PN Key - Instrumental"},
    }
    return outputs, metadata


def apply_effect(input_path: Path, output_path: Path, preset_slugs: list[str]) -> tuple[dict[str, Path], dict]:
    """Runs one or more chained pedalboard presets over the upload, writes tagged WAV + MP3 outputs."""
    y, sr = librosa.load(str(input_path), sr=None, mono=False)
    if y.ndim == 1:
        y = y[np.newaxis, :]

    processed = effects.apply_presets(preset_slugs, y.astype(np.float32), sr)
    title = "PN Key - Effect" if len(preset_slugs) == 1 else "PN Key - Effects"
    return _write_wav_and_mp3(processed, sr, output_path, title=title)


def preview_effect(input_path: Path, preset_slugs: list[str]) -> bytes:
    """Fast, short (few-second) MP3 preview of one or more chained presets — no job, no persistence."""
    y, sr = librosa.load(str(input_path), sr=None, mono=False, duration=PREVIEW_DURATION_SECONDS)
    if y.ndim == 1:
        y = y[np.newaxis, :]

    processed = effects.apply_presets(preset_slugs, y.astype(np.float32), sr)
    return encode_mp3(processed, sr, bit_rate=128)
