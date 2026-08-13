"""Storage for the public suggestion board: feature requests and bug reports.

Entries have to outlive the container, which rules out the job storage directory
— on Cloud Run that's a tmpfs that dies with the instance. So when a bucket is
configured they live in Cloud Storage, and when one isn't (local development,
the self-hosted script) they fall back to a JSON file on real disk.

The whole list is rewritten on each write rather than appended to. That's only
safe because the service runs a single instance (see the backend README on why
`--max-instances 1` is load-bearing for job state as well); the in-process lock
below serialises concurrent writes within that instance. If the service ever
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

from .config import FEEDBACK_BUCKET, FEEDBACK_LOCAL_PATH

KINDS = ("feature", "bug", "other")

# Bounded: the page shows a slice of this, and rewriting an unbounded list on
# every post gets slower forever.
MAX_STORED = 500

_OBJECT_NAME = "feedback.json"
_lock = Lock()


def _load_from_gcs() -> list[dict]:
    from google.cloud import storage  # imported lazily so local runs need no GCP deps

    client = storage.Client()
    blob = client.bucket(FEEDBACK_BUCKET).blob(_OBJECT_NAME)
    if not blob.exists():
        return []
    return json.loads(blob.download_as_text() or "[]")


def _save_to_gcs(items: list[dict]) -> None:
    from google.cloud import storage

    client = storage.Client()
    blob = client.bucket(FEEDBACK_BUCKET).blob(_OBJECT_NAME)
    blob.upload_from_string(json.dumps(items), content_type="application/json")


def _load_from_disk() -> list[dict]:
    path = Path(FEEDBACK_LOCAL_PATH)
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text("utf-8") or "[]")
    except json.JSONDecodeError:
        return []


def _save_to_disk(items: list[dict]) -> None:
    path = Path(FEEDBACK_LOCAL_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Write-then-rename so a crash mid-write can't leave a truncated file that
    # would read back as "no suggestions".
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(items), encoding="utf-8")
    os.replace(tmp, path)


def _load() -> list[dict]:
    return _load_from_gcs() if FEEDBACK_BUCKET else _load_from_disk()


def _save(items: list[dict]) -> None:
    if FEEDBACK_BUCKET:
        _save_to_gcs(items)
    else:
        _save_to_disk(items)


def _rank(item: dict) -> tuple:
    # Most-wanted first, newest breaking ties, so the board reads as a priority
    # list rather than a chronological log.
    return (-item.get("votes", 0), -item.get("created_at", 0))


def list_items(limit: int = 100) -> list[dict]:
    with _lock:
        return sorted(_load(), key=_rank)[:limit]


def add_item(name: str, kind: str, text: str) -> dict:
    item = {
        "id": uuid.uuid4().hex,
        "name": name,
        "kind": kind if kind in KINDS else "other",
        "text": text,
        "votes": 1,  # posting it counts as wanting it
        "status": "open",
        "replies": [],
        "created_at": time.time(),
    }
    with _lock:
        items = _load()
        items.insert(0, item)
        _save(sorted(items, key=_rank)[:MAX_STORED])
    return item


def add_reply(item_id: str, name: str, text: str, official: bool = False) -> dict | None:
    reply = {
        "id": uuid.uuid4().hex,
        "name": name,
        "text": text,
        # Marks a reply from the maintainer, so the board can show it as an
        # answer rather than as one more opinion from a stranger.
        "official": official,
        "created_at": time.time(),
    }
    with _lock:
        items = _load()
        for item in items:
            if item["id"] == item_id:
                # Entries written before replies existed have no list to append to.
                item.setdefault("replies", []).append(reply)
                _save(items)
                return item
    return None


def update_item(item_id: str, status: str | None = None, reply: dict | None = None) -> dict | None:
    """Applies a status change and/or an official reply in one write.

    Both together because the admin page stages edits and commits them with a
    Save button: answering "planned, because it needs the GPU work first" is one
    intent, and splitting it into two requests means it can half-apply, leaving
    a status change with no explanation attached to it.
    """
    if status is not None and status not in STATUSES:
        return None

    with _lock:
        items = _load()
        for item in items:
            if item["id"] != item_id:
                continue
            if status is not None:
                item["status"] = status
            if reply is not None:
                item.setdefault("replies", []).append(
                    {
                        "id": uuid.uuid4().hex,
                        "name": reply.get("name") or "PN Key",
                        "text": reply["text"],
                        "official": True,
                        "created_at": time.time(),
                    }
                )
            _save(items)
            return item
    return None


def delete_items(item_ids: list[str]) -> int:
    """Bulk delete, one write instead of one per entry."""
    wanted = set(item_ids)
    with _lock:
        items = _load()
        remaining = [i for i in items if i["id"] not in wanted]
        removed = len(items) - len(remaining)
        if removed:
            _save(remaining)
        return removed


def set_status_many(item_ids: list[str], status: str) -> int:
    if status not in STATUSES:
        return 0
    wanted = set(item_ids)
    with _lock:
        items = _load()
        changed = 0
        for item in items:
            if item["id"] in wanted:
                item["status"] = status
                changed += 1
        if changed:
            _save(items)
        return changed


def delete_item(item_id: str) -> bool:
    with _lock:
        items = _load()
        remaining = [i for i in items if i["id"] != item_id]
        if len(remaining) == len(items):
            return False
        _save(remaining)
        return True


def delete_reply(item_id: str, reply_id: str) -> dict | None:
    with _lock:
        items = _load()
        for item in items:
            if item["id"] == item_id:
                replies = item.get("replies", [])
                remaining = [r for r in replies if r["id"] != reply_id]
                if len(remaining) == len(replies):
                    return None
                item["replies"] = remaining
                _save(items)
                return item
    return None


STATUSES = ("open", "planned", "in-progress", "done", "declined")


def set_status(item_id: str, status: str) -> dict | None:
    if status not in STATUSES:
        return None
    with _lock:
        items = _load()
        for item in items:
            if item["id"] == item_id:
                item["status"] = status
                _save(items)
                return item
    return None


def vote(item_id: str) -> dict | None:
    with _lock:
        items = _load()
        for item in items:
            if item["id"] == item_id:
                item["votes"] = item.get("votes", 0) + 1
                _save(items)
                return item
    return None


def summary() -> dict:
    with _lock:
        items = _load()
    return {
        "count": len(items),
        "features": sum(1 for i in items if i.get("kind") == "feature"),
        "bugs": sum(1 for i in items if i.get("kind") == "bug"),
    }
