"""First-pass content filter for user-submitted reviews.

This is a blocklist, and a blocklist is a speed bump rather than a guarantee —
it will not catch a determined poster, and it isn't meant to. What it does catch
is the ordinary case: someone dropping a slur or explicit language into a public
review on a portfolio site. Anything that gets past it is still removable by
hand, since reviews are stored as plain records.

The two failure modes pull in opposite directions, and the design leans
deliberately toward the first:

- Blocking innocent text is worse than missing a bad word. Someone whose honest
  review is rejected has no idea why and no way to appeal it. So matching is on
  whole words only: "class" and "assessment" contain a blocked word as a
  substring and must pass, which naive `in` matching gets wrong (the classic
  Scunthorpe problem).
- Trivial obfuscation shouldn't work either, so the text is normalised before
  matching: accents stripped, common letter-for-symbol substitutions undone,
  padding characters between letters removed, and long runs of a repeated
  letter collapsed.
"""

from __future__ import annotations

import re
import unicodedata

# Grouped by what they are, so the rejection message can name the problem
# without repeating the word back at the user.
_PROFANITY = {
    "fuck", "fucking", "fucker", "fucked", "motherfucker", "shit", "shitty",
    "bullshit", "bitch", "bastard", "cunt", "asshole", "arsehole", "dickhead",
    "prick", "wanker", "twat", "bollocks", "piss", "crap", "damn", "goddamn",
}

_SEXUAL = {
    "sex", "sexual", "porn", "porno", "pornography", "nude", "nudes", "naked",
    "penis", "vagina", "dick", "cock", "pussy", "tits", "boobs", "titties",
    "blowjob", "handjob", "anal", "orgasm", "cum", "horny", "slut", "whore",
    "hooker", "escort", "milf", "nsfw", "xxx", "masturbate", "masturbation",
    "erotic", "fetish", "rape", "rapist", "incest", "pedophile", "paedophile",
}

# Slurs are kept as a separate category so the response can be firmer, and so
# this set can be extended without loosening the others.
_SLURS = {
    "nigger", "nigga", "faggot", "fag", "retard", "retarded", "tranny",
    "chink", "spic", "kike", "wetback", "gook", "raghead", "towelhead",
}

_CATEGORIES: list[tuple[str, set[str]]] = [
    ("slur", _SLURS),
    ("sexual", _SEXUAL),
    ("profanity", _PROFANITY),
]

# Symbols and digits people substitute for letters. Applied after accent
# stripping so "ｆｕｃｋ" and "fück" reduce the same way.
_LEET = str.maketrans({
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
    "@": "a", "$": "s", "!": "i", "|": "l",
})

_SEPARATORS = re.compile(r"[\s._\-*+~^=/\\]+")
_NON_LETTERS = re.compile(r"[^a-z ]+")
_REPEATS = re.compile(r"(.)\1{2,}")

MAX_NAME_LENGTH = 40
MAX_TEXT_LENGTH = 600
_URL = re.compile(r"https?://|www\.", re.IGNORECASE)


def _normalise(text: str) -> str:
    """Reduce text to lowercase letters and spaces, undoing common obfuscation."""
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    folded = folded.lower().translate(_LEET)
    # "f u c k" and "f.u.c.k" collapse only when the pieces are single letters,
    # so ordinary spacing between real words survives.
    folded = re.sub(r"\b(?:[a-z]\W+){2,}[a-z]\b", lambda m: re.sub(r"\W+", "", m.group()), folded)
    folded = _SEPARATORS.sub(" ", folded)
    folded = _NON_LETTERS.sub(" ", folded)
    folded = _REPEATS.sub(r"\1", folded)
    return folded


def find_violation(text: str) -> str | None:
    """Returns the category of the first blocked word found, or None if clean."""
    words = set(_normalise(text).split())
    for category, blocklist in _CATEGORIES:
        if words & blocklist:
            return category
    return None


class ReviewRejected(ValueError):
    """Raised with a message intended to be shown to the person posting."""


def clean_review(name: str, text: str) -> tuple[str, str]:
    """Validates and normalises a submission, or raises ReviewRejected.

    Returns the trimmed (name, text) to store.
    """
    name = " ".join(name.split()).strip()
    text = text.strip()

    if not text:
        raise ReviewRejected("Please write something before posting.")
    if len(text) > MAX_TEXT_LENGTH:
        raise ReviewRejected(f"Reviews are limited to {MAX_TEXT_LENGTH} characters.")
    if len(name) > MAX_NAME_LENGTH:
        raise ReviewRejected(f"Names are limited to {MAX_NAME_LENGTH} characters.")
    if _URL.search(text) or _URL.search(name):
        raise ReviewRejected("Reviews can't contain links.")

    for field in (name, text):
        category = find_violation(field)
        if category == "slur":
            raise ReviewRejected("That language isn't allowed here.")
        if category == "sexual":
            raise ReviewRejected("Please keep reviews free of sexual content.")
        if category == "profanity":
            raise ReviewRejected("Please rewrite that without the profanity.")

    return (name or "Anonymous"), text
