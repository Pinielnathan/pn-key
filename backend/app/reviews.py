"""Storage for user-submitted reviews.

Reviews have to outlive the container, which rules out the job storage directory
— on Cloud Run that's a tmpfs that dies with the instance. So when a bucket is
configured they live in Cloud Storage, and when one isn't (local development,
the self-hosted script) they fall back to a JSON file on real disk.

The whole list is rewritten on each post rather than appended to. That's only
safe because the service runs a single instance (see the backend README on why
`--max-instances 1` is load-bearing for job state as well); the in-process lock
below serialises concurrent posts within that instance. If the service ever
scales out, this needs to become a real datastore rather than a read-modify-
write against one object.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from threading import Lock

from .config import REVIEWS_BUCKET, REVIEWS_LOCAL_PATH

# Newest first, and bounded: the page shows a slice of this, and rewriting an
# unbounded list on every post gets slower forever.
MAX_STORED = 500

_OBJECT_NAME = "reviews.json"
_lock = Lock()


def _load_from_gcs() -> list[dict]:
    from google.cloud import storage  # imported lazily so local runs need no GCP deps

    client = storage.Client()
    blob = client.bucket(REVIEWS_BUCKET).blob(_OBJECT_NAME)
    if not blob.exists():
        return []
    return json.loads(blob.download_as_text() or "[]")


def _save_to_gcs(reviews: list[dict]) -> None:
    from google.cloud import storage

    client = storage.Client()
    blob = client.bucket(REVIEWS_BUCKET).blob(_OBJECT_NAME)
    blob.upload_from_string(json.dumps(reviews), content_type="application/json")


def _load_from_disk() -> list[dict]:
    path = Path(REVIEWS_LOCAL_PATH)
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text("utf-8") or "[]")
    except json.JSONDecodeError:
        return []


def _save_to_disk(reviews: list[dict]) -> None:
    path = Path(REVIEWS_LOCAL_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Write-then-rename so a crash mid-write can't leave a truncated file that
    # would read back as "no reviews".
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(reviews), encoding="utf-8")
    os.replace(tmp, path)


def _load() -> list[dict]:
    return _load_from_gcs() if REVIEWS_BUCKET else _load_from_disk()


def _save(reviews: list[dict]) -> None:
    if REVIEWS_BUCKET:
        _save_to_gcs(reviews)
    else:
        _save_to_disk(reviews)


def list_reviews(limit: int = 50) -> list[dict]:
    with _lock:
        return _load()[:limit]


def add_review(name: str, rating: int, text: str) -> dict:
    review = {
        "id": uuid.uuid4().hex,
        "name": name,
        "rating": rating,
        "text": text,
        "created_at": time.time(),
    }
    with _lock:
        reviews = _load()
        reviews.insert(0, review)
        _save(reviews[:MAX_STORED])
    return review


def summary() -> dict:
    """Average rating and count, for the header above the list."""
    with _lock:
        reviews = _load()
    if not reviews:
        return {"count": 0, "average": None}
    return {
        "count": len(reviews),
        "average": round(sum(r["rating"] for r in reviews) / len(reviews), 1),
    }
