import os
from pathlib import Path

STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", "/tmp/pn-key-jobs"))

# Finished jobs keep their audio around so the user can still hit download after
# the fact. On Cloud Run the job directory is a tmpfs — "disk" there is really
# RAM and counts against the container's memory limit — so holding every output
# for hours is a slow climb toward the limit that killed this service before.
# Long enough to download what you just made, short enough to stay bounded.
JOB_TTL_SECONDS = int(os.environ.get("JOB_TTL_SECONDS", str(45 * 60)))

ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")]

# Cloud Run rejects any request body over 32 MiB at its own edge proxy, before
# the request ever reaches this app — the client gets an HTML error page rather
# than our JSON, so a limit above that is one this app can never actually
# enforce or report on. Stay just under it so oversized uploads fail as a clean,
# readable API error instead.
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(31 * 1024 * 1024)))

DEMUCS_MODEL = os.environ.get("DEMUCS_MODEL", "htdemucs")

# Seconds of audio Demucs processes per window. See the call site in audio_ops
# for why this is pinned rather than left to default to the whole track. 7 is
# also the largest value htdemucs accepts (its training segment is 7.8s and the
# flag takes an int), so this is simultaneously the memory cap and the fastest
# setting — bigger windows would mean fewer of them, but the model won't take one.
DEMUCS_SEGMENT = int(os.environ.get("DEMUCS_SEGMENT", "7"))

# Fraction of each window recomputed to cross-fade the seams. See the call site.
DEMUCS_OVERLAP = float(os.environ.get("DEMUCS_OVERLAP", "0.1"))

# Suggestion-board entries outlive the container, so they can't live in
# STORAGE_DIR: on Cloud Run that's a tmpfs. With a bucket set they go to Cloud
# Storage; without one they go to a JSON file on real disk, which is what local
# runs and the self-hosted script use.
FEEDBACK_BUCKET = os.environ.get("FEEDBACK_BUCKET", "").strip()
FEEDBACK_LOCAL_PATH = os.environ.get("FEEDBACK_LOCAL_PATH", str(Path.home() / ".pn-key" / "feedback.json"))

# Per-IP posting limit, to keep a bored visitor from filling the board.
FEEDBACK_RATE_LIMIT = int(os.environ.get("FEEDBACK_RATE_LIMIT", "5"))
FEEDBACK_RATE_WINDOW_SECONDS = int(os.environ.get("FEEDBACK_RATE_WINDOW_SECONDS", str(60 * 60)))

# Shared secret for the admin page, which can delete anything on the board.
# Unset means every admin endpoint refuses outright rather than defaulting to
# something guessable: an admin API that ships with a fallback password is worse
# than one that's switched off, because it looks protected and isn't.
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "").strip()

# How many uploads may be processed at once. Each in-flight separation holds a
# model and its activations in memory, so N at once costs roughly N times the
# peak — which is how a handful of simultaneous uploads can exceed the memory
# limit even when any one of them fits comfortably. Extra work waits in the
# "queued" state instead of competing for memory.
MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "1"))
