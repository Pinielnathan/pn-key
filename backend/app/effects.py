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
    LowShelfFilter,
    NoiseGate,
    Pedalboard,
    Phaser,
    PitchShift,
    Reverb,
)

CATEGORIES = [
    {"id": "space", "name": "Space & Reverb"},
    {"id": "character", "name": "Character & Novelty"},
    {"id": "lofi", "name": "Lo-Fi & Retro"},
    {"id": "polish", "name": "Vocal Polish"},
    {"id": "mood", "name": "Mood"},
]

# Each board is a zero-arg factory so every request gets fresh effect
# instances instead of sharing mutable state across threads.
_PRESETS: dict[str, dict] = {
    "concert-hall": {
        "name": "Concert Hall",
        "category": "space",
        "description": "Big, spacious reverb, like singing on a large stage.",
        "board": lambda: Pedalboard(
            [Reverb(room_size=0.8, damping=0.3, wet_level=0.35, dry_level=0.6, width=1.0)]
        ),
    },
    "cathedral": {
        "name": "Cathedral",
        "category": "space",
        "description": "Massive, cavernous reverb tail.",
        "board": lambda: Pedalboard(
            [Reverb(room_size=1.0, damping=0.1, wet_level=0.6, dry_level=0.3, width=1.0)]
        ),
    },
    "stadium-anthem": {
        "name": "Stadium Anthem",
        "category": "space",
        "description": "Huge, wide arena ambience for big choruses.",
        "board": lambda: Pedalboard(
            [
                Delay(delay_seconds=0.25, feedback=0.25, mix=0.3),
                Reverb(room_size=0.95, damping=0.2, wet_level=0.5, dry_level=0.5, width=1.0),
            ]
        ),
    },
    "underwater": {
        "name": "Underwater",
        "category": "space",
        "description": "Muffled, wavering, submerged sound.",
        "board": lambda: Pedalboard(
            [
                LowpassFilter(cutoff_frequency_hz=500),
                Chorus(rate_hz=0.3, depth=0.6, mix=0.5),
                Reverb(room_size=0.5, wet_level=0.3),
            ]
        ),
    },
    "echo-chamber": {
        "name": "Echo Chamber",
        "category": "space",
        "description": "Rhythmic slapback echo repeats.",
        "board": lambda: Pedalboard([Delay(delay_seconds=0.3, feedback=0.35, mix=0.4)]),
    },
    "canyon": {
        "name": "Canyon",
        "category": "space",
        "description": "Long slapback echo trailing into a huge reverb tail.",
        "board": lambda: Pedalboard(
            [
                Delay(delay_seconds=0.4, feedback=0.4, mix=0.35),
                Reverb(room_size=0.9, damping=0.15, wet_level=0.45, dry_level=0.5),
            ]
        ),
    },
    "robot": {
        "name": "Robot",
        "category": "character",
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
        "category": "character",
        "description": "High-pitched, sped-up cartoon voice.",
        "board": lambda: Pedalboard([PitchShift(semitones=7)]),
    },
    "deep-voice": {
        "name": "Deep Voice",
        "category": "character",
        "description": "Low, ominous pitched-down voice.",
        "board": lambda: Pedalboard([PitchShift(semitones=-6), Reverb(room_size=0.4, wet_level=0.2)]),
    },
    "alien": {
        "name": "Alien",
        "category": "character",
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
        "category": "character",
        "description": "Monstrous, cavernous, deep pitched-down voice.",
        "board": lambda: Pedalboard(
            [PitchShift(semitones=-9), Reverb(room_size=0.7, wet_level=0.3), Compressor(threshold_db=-15, ratio=3)]
        ),
    },
    "megaphone": {
        "name": "Megaphone",
        "category": "character",
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
    "haunted": {
        "name": "Haunted",
        "category": "character",
        "description": "Eerie phaser sweep with a ghostly tail.",
        "board": lambda: Pedalboard(
            [Phaser(rate_hz=0.5, depth=0.7, feedback=0.4, mix=0.6), Reverb(room_size=0.7, wet_level=0.35)]
        ),
    },
    "storm": {
        "name": "Storm",
        "category": "character",
        "description": "Chaotic, distorted, swirling and huge.",
        "board": lambda: Pedalboard(
            [
                Distortion(drive_db=18),
                Phaser(rate_hz=1.0, depth=0.8, feedback=0.5, mix=0.5),
                Reverb(room_size=0.85, wet_level=0.4),
            ]
        ),
    },
    "telephone": {
        "name": "Telephone",
        "category": "lofi",
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
    "radio": {
        "name": "Radio",
        "category": "lofi",
        "description": "Crunchy, band-limited AM radio broadcast sound.",
        "board": lambda: Pedalboard(
            [
                HighpassFilter(cutoff_frequency_hz=300),
                LowpassFilter(cutoff_frequency_hz=4000),
                Distortion(drive_db=15),
            ]
        ),
    },
    "warm-vintage": {
        "name": "Warm Vintage",
        "category": "lofi",
        "description": "Analog tape warmth. Rounded low end, softened top end.",
        "board": lambda: Pedalboard(
            [
                HighShelfFilter(cutoff_frequency_hz=200, gain_db=2),
                HighShelfFilter(cutoff_frequency_hz=6000, gain_db=-4),
                Distortion(drive_db=3),
                Compressor(threshold_db=-18, ratio=3),
            ]
        ),
    },
    "lofi-bedroom": {
        "name": "Lo-Fi Bedroom",
        "category": "lofi",
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
        "category": "lofi",
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
    "cassette": {
        "name": "Cassette",
        "category": "lofi",
        "description": "Warm tape wobble with a soft, rolled-off top end.",
        "board": lambda: Pedalboard(
            [
                Chorus(rate_hz=0.15, depth=0.3, mix=0.3),
                LowpassFilter(cutoff_frequency_hz=6000),
                Distortion(drive_db=2),
                NoiseGate(threshold_db=-40),
            ]
        ),
    },
    "bright-airy": {
        "name": "Bright & Airy",
        "category": "polish",
        "description": "Modern pop clarity and shimmer. Sits forward in a mix.",
        "board": lambda: Pedalboard(
            [
                HighpassFilter(cutoff_frequency_hz=100),
                HighShelfFilter(cutoff_frequency_hz=7000, gain_db=5),
                Chorus(rate_hz=2.0, depth=0.15, mix=0.2),
            ]
        ),
    },
    "intimate-whisper": {
        "name": "Intimate Whisper",
        "category": "polish",
        "description": "Dry, dark and close. Like singing right into the mic.",
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
        "category": "polish",
        "description": "Thickens a single vocal take into a fuller, doubled sound.",
        "board": lambda: Pedalboard(
            [
                Chorus(rate_hz=0.8, depth=0.15, centre_delay_ms=15.0, feedback=0.1, mix=0.5),
                Delay(delay_seconds=0.02, feedback=0.1, mix=0.3),
            ]
        ),
    },
    "studio-clean": {
        "name": "Studio Clean",
        "category": "polish",
        "description": "Transparent, professional polish. Just enough, not too much.",
        "board": lambda: Pedalboard(
            [
                HighpassFilter(cutoff_frequency_hz=80),
                Compressor(threshold_db=-18, ratio=2.5, attack_ms=5, release_ms=60),
                Limiter(threshold_db=-1),
            ]
        ),
    },
    "wide-stage": {
        "name": "Wide Stage",
        "category": "polish",
        "description": "Widens a single vocal take for a fuller stereo image.",
        "board": lambda: Pedalboard(
            [
                Chorus(rate_hz=0.5, depth=0.3, centre_delay_ms=10.0, mix=0.4),
                Delay(delay_seconds=0.015, mix=0.25),
            ]
        ),
    },
    "velvet": {
        "name": "Velvet",
        "category": "polish",
        "description": "Smooth, warm and evenly compressed.",
        "board": lambda: Pedalboard(
            [
                LowShelfFilter(cutoff_frequency_hz=250, gain_db=1.5),
                Compressor(threshold_db=-20, ratio=3.5, attack_ms=8, release_ms=120),
                HighShelfFilter(cutoff_frequency_hz=8000, gain_db=1.5),
            ]
        ),
    },
    "melancholy": {
        "name": "Melancholy",
        "category": "mood",
        "description": "Dark and introspective, with a soft reverb tail.",
        "board": lambda: Pedalboard(
            [
                LowShelfFilter(cutoff_frequency_hz=300, gain_db=2),
                HighShelfFilter(cutoff_frequency_hz=4000, gain_db=-5),
                Reverb(room_size=0.6, wet_level=0.3, damping=0.6),
            ]
        ),
    },
    "euphoric": {
        "name": "Euphoric",
        "category": "mood",
        "description": "Bright, wide and uplifting.",
        "board": lambda: Pedalboard(
            [
                HighShelfFilter(cutoff_frequency_hz=6000, gain_db=4),
                Chorus(rate_hz=1.2, depth=0.4, mix=0.4),
                Delay(delay_seconds=0.2, feedback=0.2, mix=0.25),
                Reverb(room_size=0.6, wet_level=0.3),
            ]
        ),
    },
    "dreamy": {
        "name": "Dreamy",
        "category": "mood",
        "description": "Hazy, soft and chorused, like floating.",
        "board": lambda: Pedalboard(
            [
                LowpassFilter(cutoff_frequency_hz=5000),
                Chorus(rate_hz=0.4, depth=0.5, mix=0.5),
                Reverb(room_size=0.7, wet_level=0.4, damping=0.4),
            ]
        ),
    },
    "nostalgic": {
        "name": "Nostalgic",
        "category": "mood",
        "description": "Warm and slightly worn, like an old memory.",
        "board": lambda: Pedalboard(
            [
                HighShelfFilter(cutoff_frequency_hz=5000, gain_db=-3),
                Distortion(drive_db=2),
                Reverb(room_size=0.5, wet_level=0.25),
            ]
        ),
    },
}


def list_categories() -> list[dict]:
    return CATEGORIES


def list_presets() -> list[dict]:
    return [
        {"slug": slug, "name": p["name"], "description": p["description"], "category": p["category"]}
        for slug, p in _PRESETS.items()
    ]


def apply_preset(slug: str, audio: np.ndarray, sample_rate: int) -> np.ndarray:
    preset = _PRESETS.get(slug)
    if preset is None:
        raise ValueError(f"Unknown preset: {slug}")
    board = preset["board"]()
    return board(audio, sample_rate)
