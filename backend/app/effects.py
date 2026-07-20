from __future__ import annotations

import numpy as np
from pedalboard import (
    Bitcrush,
    Chorus,
    Delay,
    Distortion,
    Gain,
    HighpassFilter,
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
}


def list_presets() -> list[dict]:
    return [{"slug": slug, "name": p["name"], "description": p["description"]} for slug, p in _PRESETS.items()]


def apply_preset(slug: str, audio: np.ndarray, sample_rate: int) -> np.ndarray:
    preset = _PRESETS.get(slug)
    if preset is None:
        raise ValueError(f"Unknown preset: {slug}")
    board = preset["board"]()
    return board(audio, sample_rate)
