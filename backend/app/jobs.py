import shutil
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from threading import BoundedSemaphore, Lock
from typing import Iterator, Optional

from .config import JOB_TTL_SECONDS, MAX_CONCURRENT_JOBS, STORAGE_DIR


@dataclass
class Job:
    id: str
    kind: str  # "retune" | "separate"
    status: str = "queued"  # queued | processing | done | error
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    outputs: dict = field(default_factory=dict)  # stem name -> Path
    metadata: dict = field(default_factory=dict)  # stem name -> {"bpm", "key_name", "title"}
    dir: Path = field(init=False)

    def __post_init__(self) -> None:
        self.dir = STORAGE_DIR / self.id


_jobs: dict[str, Job] = {}
_lock = Lock()

_heavy_slots = BoundedSemaphore(MAX_CONCURRENT_JOBS)


@contextmanager
def heavy_slot() -> Iterator[None]:
    """Held for the duration of one upload's actual audio processing.

    Bounds how much of that work runs at once — see MAX_CONCURRENT_JOBS. A job
    waiting here stays "queued", which is what that status is for.
    """
    _heavy_slots.acquire()
    try:
        yield
    finally:
        _heavy_slots.release()


def create_job(kind: str) -> Job:
    cleanup_expired()
    job = Job(id=uuid.uuid4().hex, kind=kind)
    job.dir.mkdir(parents=True, exist_ok=True)
    with _lock:
        _jobs[job.id] = job
    return job


def get_job(job_id: str) -> Optional[Job]:
    with _lock:
        return _jobs.get(job_id)


def cleanup_expired() -> None:
    now = time.time()
    expired: list[Job] = []
    with _lock:
        for job_id, job in list(_jobs.items()):
            if now - job.created_at > JOB_TTL_SECONDS:
                expired.append(job)
                del _jobs[job_id]
    for job in expired:
        shutil.rmtree(job.dir, ignore_errors=True)
