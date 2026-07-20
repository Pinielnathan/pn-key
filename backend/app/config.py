import os
from pathlib import Path

STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", "/tmp/pn-key-jobs"))
JOB_TTL_SECONDS = int(os.environ.get("JOB_TTL_SECONDS", str(2 * 60 * 60)))
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")]
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))
DEMUCS_MODEL = os.environ.get("DEMUCS_MODEL", "htdemucs")
