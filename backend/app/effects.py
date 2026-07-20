from __future__ import annotations

import numpy as np
from pedalboard import (
    Bitcrush,
    Chorus,
    Compressor,
    Delay,
    Distortion,
    Gain,
    HighpassFilter,
    HighShelfFilter,
    Limiter,
    LowpassFilter,
    Pedalboard,
    Phaser,
    PitchShift,
    Reverb,
)

# Each board is a zero-arg factory so every request gets fresh effect
# instances instead of sharing mutable state across threads.
_PRESETS: dict[str, dict] = {
    "concert-hall": {
        "name": "Concert Hall",
        "description": "Big, spacious reverb, like singing on a large stage.",
        "board": lambda: Pedalboard(
            [Reverb(room_size=0.8, damping=0.3, wet_level=0.35, dry_level=0.6, width=1.0)]
        ),
    },
    "telephone": {
        "name": "Telephone",
        "description": "Narrow, gritty band-limited phone-call sound.",
        "board": lambda: Pedalboard(
            [
                HighpassFilter(cutoff_frequency_hz=400),
                LowpassFilter(cutoff_frequency_hz=3400),
                Distortion(drive_db=8),
                Gain(gain_db=6),
            ]
        ),
    },
    "robot": {
        "name": "Robot",
        "description": "Metallic, mechanical vocoder-ish texture.",
        "board": lambda: Pedalboard(
            [
                PitchShift(semitones=-2),
                Chorus(rate_hz=0.6, depth=0.8, centre_delay_ms=4.0, feedback=0.3, mix=0.7),
                Bitcrush(bit_depth=8),
            ]
        ),
    },
    "chipmunk": {
        "name": "Chipmunk",
        "description": "High-pitched, sped-up cartoon voice.",
        "board": lambda: Pedalboard([PitchShift(semitones=7)]),
    },
    "deep-voice": {
        "name": "Deep Voice",
        "description": "Low, ominous pitched-down voice.",
        "board": lambda: Pedalboard([PitchShift(semitones=-6), Reverb(room_size=0.4, wet_level=0.2)]),
    },
    "echo-chamber": {
        "name": "Echo Chamber",
        "description": "Rhythmic slapback echo repeats.",
        "board": lambda: Pedalboard([Delay(delay_seconds=0.3, feedback=0.35, mix=0.4)]),
    },
    "radio": {
        "name": "Radio",
        "description": "Crunchy, band-limited AM radio broadcast sound.",
        "board": lambda: Pedalboard(
            [
                HighpassFilter(cutoff_frequency_hz=300),
                LowpassFilter(cutoff_frequency_hz=4000),
                Distortion(drive_db=15),
            ]
        ),
    },
    "underwater": {
        "name": "Underwater",
        "description": "Muffled, wavering, submerged sound.",
        "board": lambda: Pedalboard(
            [
                LowpassFilter(cutoff_frequency_hz=500),
                Chorus(rate_hz=0.3, depth=0.6, mix=0.5),
                Reverb(room_size=0.5, wet_level=0.3),
            ]
        ),
    },
    "haunted": {
        "name": "Haunted",
        "description": "Eerie phaser sweep with a ghostly tail.",
        "board": lambda: Pedalboard(
            [Phaser(rate_hz=0.5, depth=0.7, feedback=0.4, mix=0.6), Reverb(room_size=0.7, wet_level=0.35)]
        ),
    },
    "warm-vintage": {
        "name": "Warm Vintage",
        "description": "Analog tape warmth — rounded low end, softened top end.",
        "board": lambda: Pedalboard(
            [
                HighShelfFilter(cutoff_frequency_hz=200, gain_db=2),
                HighShelfFilter(cutoff_frequency_hz=6000, gain_db=-4),
                Distortion(drive_db=3),
                Compressor(threshold_db=-18, ratio=3),
            ]
        ),
    },
    "bright-airy": {
        "name": "Bright & Airy",
        "description": "Modern pop clarity and shimmer, sits forward in a mix.",
        "board": lambda: Pedalboard(
            [
                HighpassFilter(cutoff_frequency_hz=100),
                HighShelfFilter(cutoff_frequency_hz=7000, gain_db=5),
                Chorus(rate_hz=2.0, depth=0.15, mix=0.2),
            ]
        ),
    },
    "stadium-anthem": {
        "name": "Stadium Anthem",
        "description": "Huge, wide arena ambience for big choruses.",
        "board": lambda: Pedalboard(
            [
                Delay(delay_seconds=0.25, feedback=0.25, mix=0.3),
                Reverb(room_size=0.95, damping=0.2, wet_level=0.5, dry_level=0.5, width=1.0),
            ]
        ),
    },
    "intimate-whisper": {
        "name": "Intimate Whisper",
        "description": "Dry, dark and close, like singing right into the mic.",
        "board": lambda: Pedalboard(
            [
                HighShelfFilter(cutoff_frequency_hz=5000, gain_db=-6),
                Compressor(threshold_db=-24, ratio=4),
                Gain(gain_db=-2),
            ]
        ),
    },
    "doubler": {
        "name": "Doubler",
        "description": "Thickens a single vocal take into a fuller, doubled sound.",
        "board": lambda: Pedalboard(
            [
                Chorus(rate_hz=0.8, depth=0.15, centre_delay_ms=15.0, feedback=0.1, mix=0.5),
                Delay(delay_seconds=0.02, feedback=0.1, mix=0.3),
            ]
        ),
    },
    "lofi-bedroom": {
        "name": "Lo-Fi Bedroom",
        "description": "Hazy, degraded bedroom-pop texture.",
        "board": lambda: Pedalboard(
            [
                LowpassFilter(cutoff_frequency_hz=4000),
                Bitcrush(bit_depth=10),
                Chorus(rate_hz=0.3, depth=0.2, mix=0.3),
                Gain(gain_db=-2),
            ]
        ),
    },
    "broadcast-polish": {
        "name": "Broadcast Polish",
        "description": "Clean, present, radio-DJ-ready vocal chain.",
        "board": lambda: Pedalboard(
            [
                HighpassFilter(cutoff_frequency_hz=90),
                Compressor(threshold_db=-20, ratio=4, attack_ms=2, release_ms=80),
                HighShelfFilter(cutoff_frequency_hz=6000, gain_db=3),
                Limiter(threshold_db=-2),
            ]
        ),
    },
    "cathedral": {
        "name": "Cathedral",
        "description": "Massive, cavernous reverb tail.",
        "board": lambda: Pedalboard(
            [Reverb(room_size=1.0, damping=0.1, wet_level=0.6, dry_level=0.3, width=1.0)]
        ),
    },
    "megaphone": {
        "name": "Megaphone",
        "description": "Extreme narrow-band bullhorn distortion.",
        "board": lambda: Pedalboard(
            [
                HighpassFilter(cutoff_frequency_hz=800),
                LowpassFilter(cutoff_frequency_hz=2500),
                Distortion(drive_db=20),
                Gain(gain_db=4),
            ]
        ),
    },
    "alien": {
        "name": "Alien",
        "description": "Otherworldly pitched, chorused, bitcrushed texture.",
        "board": lambda: Pedalboard(
            [
                PitchShift(semitones=5),
                Chorus(rate_hz=1.5, depth=0.9, feedback=0.4, mix=0.6),
                Bitcrush(bit_depth=12),
                Delay(delay_seconds=0.15, feedback=0.3, mix=0.3),
            ]
        ),
    },
    "giant": {
        "name": "Giant",
        "description": "Monstrous, cavernous, deep pitched-down voice.",
        "board": lambda: Pedalboard(
            [PitchShift(semitones=-9), Reverb(room_size=0.7, wet_level=0.3), Compressor(threshold_db=-15, ratio=3)]
        ),
    },
}


def list_presets() -> list[dict]:
    return [{"slug": slug, "name": p["name"], "description": p["description"]} for slug, p in _PRESETS.items()]


def apply_preset(slug: str, audio: np.ndarray, sample_rate: int) -> np.ndarray:
    preset = _PRESETS.get(slug)
    if preset is None:
        raise ValueError(f"Unknown preset: {slug}")
    board = preset["board"]()
    return board(audio, sample_rate)
