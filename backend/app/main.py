import json
import re
import tempfile
import threading
import time
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from . import audio_ops, effects, feedback, moderation
from .config import (
    ALLOWED_ORIGINS,
    FEEDBACK_RATE_LIMIT,
    FEEDBACK_RATE_WINDOW_SECONDS,
    MAX_UPLOAD_BYTES,
    STORAGE_DIR,
)


from .jobs import Job, create_job, get_job, heavy_slot


class FeedbackSubmission(BaseModel):
    name: str = Field(default="", max_length=200)
    kind: str = Field(default="other")
    # Generous here on purpose: moderation.clean_submission owns the real limit
    # and returns a message explaining it, which is friendlier than a 422.
    text: str = Field(max_length=5000)

# Job state lives in this process's memory, so anything that restarts the
# process drops it. A poll for a job we don't have is therefore much more often
# "the server restarted underneath it" than a genuinely bogus id, and the bare
# "Job not found" this used to return sent people looking for a bug in their own
# request instead of telling them to just run it again.
_JOB_GONE_DETAIL = (
    "This job is no longer on the server. It either finished long enough ago to be "
    "cleaned up, or the server restarted while it was running. Please run it again."
)

STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PN Key API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    # Content-Disposition isn't in the CORS-safelisted response headers by default, so without this
    # the frontend's fetch() calls can't read the server-suggested filename off a cross-origin response.
    expose_headers=["Content-Disposition"],
)

_SAFE_EXTENSIONS = {
    ".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac", ".aiff", ".wma",
    ".webm", ".mp4",  # browser MediaRecorder output (mic recordings)
}


def _safe_suffix(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    return suffix if suffix in _SAFE_EXTENSIONS else ".wav"


def _slugify(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-")
    return slug or "pnkey"


def _download_filename(job: Job, stem: str, format: str) -> str:
    """A descriptive filename carrying the detected BPM/key, instead of a bare stem name."""
    detected = job.metadata.get(stem)
    if not detected:
        return f"{stem}.{format}"
    slug = _slugify(detected.get("title", stem))
    bpm = round(detected["bpm"])
    key = detected["key_name"]
    return f"{slug}-{bpm}bpm-{key}.{format}"


def _parse_presets(presets: str) -> list[str]:
    """`presets` is a JSON array string, e.g. '["cathedral","doubler"]'."""
    try:
        slugs = json.loads(presets)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="`presets` must be a JSON array of slugs") from exc
    if not isinstance(slugs, list) or not slugs or not all(isinstance(s, str) for s in slugs):
        raise HTTPException(status_code=400, detail="`presets` must be a non-empty JSON array of strings")

    available = {p["slug"] for p in effects.list_presets()}
    unknown = [s for s in slugs if s not in available]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown preset(s): {', '.join(unknown)}")
    return slugs


async def _save_upload(upload: UploadFile, dest: Path) -> None:
    size = 0
    too_large = False
    with dest.open("wb") as f:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                too_large = True
                break
            f.write(chunk)

    # Deleting the partial file has to happen out here, after the with-block has
    # closed the handle: Windows refuses to unlink a file that's still open, so
    # doing this inside the loop turned an intended 413 into a 500.
    if too_large or size == 0:
        dest.unlink(missing_ok=True)

    if too_large:
        limit_mb = MAX_UPLOAD_BYTES / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File is larger than the {limit_mb:.0f} MB limit. Convert it to MP3 or trim it, then try again.",
        )
    if size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")


def _run_retune(
    job: Job,
    input_path: Path,
    source_bpm: float,
    target_bpm: float,
    semitone_shift: float,
) -> None:
    try:
        with heavy_slot():
            job.status = "processing"
            output_path = job.dir / "output.wav"
            paths, detected = audio_ops.retune(input_path, output_path, source_bpm, target_bpm, semitone_shift)
            job.outputs["output"] = paths
            job.metadata["output"] = detected
        job.status = "done"
    except Exception as exc:  # noqa: BLE001
        job.status = "error"
        job.error = str(exc)


def _run_separate(job: Job, input_path: Path) -> None:
    try:
        with heavy_slot():
            job.status = "processing"
            outputs, metadata = audio_ops.separate(input_path, job.dir / "stems")
            job.outputs.update(outputs)
            job.metadata.update(metadata)
        job.status = "done"
    except Exception as exc:  # noqa: BLE001
        job.status = "error"
        job.error = str(exc)


def _run_effect(job: Job, input_path: Path, preset_slugs: list[str]) -> None:
    try:
        with heavy_slot():
            job.status = "processing"
            output_path = job.dir / "output.wav"
            paths, detected = audio_ops.apply_effect(input_path, output_path, preset_slugs)
            job.outputs["output"] = paths
            job.metadata["output"] = detected
        job.status = "done"
    except Exception as exc:  # noqa: BLE001
        job.status = "error"
        job.error = str(exc)


def _warm_up() -> None:
    """Pay librosa's one-off JIT cost at startup instead of on someone's first upload.

    librosa's beat tracking and HPSS are numba-compiled on first call, which cost
    ~20s the first time and ~3s every time after. Since the container scales to
    zero, that compile landed on a real user's first job often enough to matter —
    it was most of why the very first separation looked so much slower than the
    next one. Running it here against a scrap of generated audio means the
    container absorbs it while it's still warming up, before it takes traffic.
    """
    try:
        import numpy as np
        import soundfile as sf

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "warmup.wav"
            sample_rate = audio_ops.ANALYZE_SAMPLE_RATE
            t = np.linspace(0, 4.0, int(sample_rate * 4.0), endpoint=False)
            # A click track over a tone: gives the beat tracker and the chroma
            # estimator each something real to compile against.
            tone = 0.3 * np.sin(2 * np.pi * 220 * t)
            clicks = 0.5 * (np.sin(2 * np.pi * 8 * t) > 0.98)
            sf.write(str(path), tone + clicks, sample_rate)
            audio_ops.analyze(path)
    except Exception:  # noqa: BLE001
        # Warm-up is an optimisation; if it fails the first real request just
        # pays the compile as it did before. Never block startup on it.
        pass


@app.on_event("startup")
def _schedule_warm_up() -> None:
    # In a thread so the container reports ready immediately — Cloud Run starts
    # its startup probe right away, and blocking here would delay serving.
    threading.Thread(target=_warm_up, daemon=True).start()


@app.post("/api/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    with tempfile.TemporaryDirectory(dir=STORAGE_DIR) as tmp_dir:
        input_path = Path(tmp_dir) / f"input{_safe_suffix(file.filename)}"
        await _save_upload(file, input_path)
        try:
            return audio_ops.analyze(input_path)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"Could not analyze audio: {exc}") from exc


@app.post("/api/retune/preview")
async def preview_retune(
    file: UploadFile = File(...),
    source_bpm: float = Form(...),
    target_bpm: float = Form(...),
    semitone_shift: float = Form(0),
):
    if source_bpm <= 0 or target_bpm <= 0:
        raise HTTPException(status_code=400, detail="BPM values must be positive")
    if not (-24 <= semitone_shift <= 24):
        raise HTTPException(status_code=400, detail="Semitone shift must be between -24 and 24")

    with tempfile.TemporaryDirectory(dir=STORAGE_DIR) as tmp_dir:
        input_path = Path(tmp_dir) / f"input{_safe_suffix(file.filename)}"
        await _save_upload(file, input_path)
        try:
            mp3_bytes = audio_ops.preview_retune(input_path, source_bpm, target_bpm, semitone_shift)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"Could not generate preview: {exc}") from exc

    return Response(content=mp3_bytes, media_type="audio/mpeg")


@app.post("/api/jobs/retune")
async def create_retune_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    source_bpm: float = Form(...),
    target_bpm: float = Form(...),
    semitone_shift: float = Form(0),
):
    if source_bpm <= 0 or target_bpm <= 0:
        raise HTTPException(status_code=400, detail="BPM values must be positive")
    if not (-24 <= semitone_shift <= 24):
        raise HTTPException(status_code=400, detail="Semitone shift must be between -24 and 24")

    job = create_job("retune")
    input_path = job.dir / f"input{_safe_suffix(file.filename)}"
    await _save_upload(file, input_path)

    background_tasks.add_task(_run_retune, job, input_path, source_bpm, target_bpm, semitone_shift)
    return {"job_id": job.id, "status": job.status}


@app.post("/api/jobs/separate")
async def create_separate_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    job = create_job("separate")
    input_path = job.dir / f"source{_safe_suffix(file.filename)}"
    await _save_upload(file, input_path)

    background_tasks.add_task(_run_separate, job, input_path)
    return {"job_id": job.id, "status": job.status}


@app.get("/api/effects/presets")
async def list_effect_presets():
    return {"presets": effects.list_presets(), "categories": effects.list_categories()}


@app.post("/api/effects/preview")
async def preview_effect(file: UploadFile = File(...), presets: str = Form(...)):
    slugs = _parse_presets(presets)

    with tempfile.TemporaryDirectory(dir=STORAGE_DIR) as tmp_dir:
        input_path = Path(tmp_dir) / f"input{_safe_suffix(file.filename)}"
        await _save_upload(file, input_path)
        try:
            mp3_bytes = audio_ops.preview_effect(input_path, slugs)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"Could not generate preview: {exc}") from exc

    return Response(content=mp3_bytes, media_type="audio/mpeg")


@app.post("/api/jobs/effects")
async def create_effect_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    presets: str = Form(...),
):
    slugs = _parse_presets(presets)

    job = create_job("effects")
    input_path = job.dir / f"input{_safe_suffix(file.filename)}"
    await _save_upload(file, input_path)

    background_tasks.add_task(_run_effect, job, input_path, slugs)
    return {"job_id": job.id, "status": job.status}


@app.get("/api/jobs/{job_id}")
async def job_status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=_JOB_GONE_DETAIL)
    return {
        "job_id": job.id,
        "kind": job.kind,
        "status": job.status,
        "error": job.error,
        "outputs": list(job.outputs.keys()),
    }


@app.get("/api/jobs/{job_id}/download/{stem}")
async def download_output(job_id: str, stem: str, format: str = "wav"):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=_JOB_GONE_DETAIL)
    formats = job.outputs.get(stem)
    if not formats:
        raise HTTPException(status_code=404, detail="Output not ready")
    path = formats.get(format)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail=f"Format '{format}' not available")
    media_type = "audio/mpeg" if format == "mp3" else "audio/wav"
    return FileResponse(path, filename=_download_filename(job, stem, format), media_type=media_type)


_recent_posts: dict[str, list[float]] = {}
_rate_lock = threading.Lock()


def _at_rate_limit(client_ip: str) -> bool:
    now = time.time()
    with _rate_lock:
        history = [t for t in _recent_posts.get(client_ip, []) if now - t < FEEDBACK_RATE_WINDOW_SECONDS]
        _recent_posts[client_ip] = history
        return len(history) >= FEEDBACK_RATE_LIMIT


def _record_post(client_ip: str) -> None:
    """Counted only once a review is actually accepted.

    Checking and recording are separate so a rejected submission doesn't consume
    the poster's allowance: someone who trips the profanity filter, pastes a
    link or mistypes would otherwise spend their quota on attempts that were
    never published, and get locked out while writing a perfectly good review.
    """
    with _rate_lock:
        _recent_posts.setdefault(client_ip, []).append(time.time())


def _client_ip(request: Request) -> str:
    # Cloud Run terminates TLS upstream, so the caller's address is the first
    # entry in X-Forwarded-For rather than the socket's peer.
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


@app.get("/api/feedback")
async def get_feedback():
    return {"items": feedback.list_items(), **feedback.summary()}


@app.post("/api/feedback")
async def post_feedback(request: Request, payload: FeedbackSubmission):
    client_ip = _client_ip(request)
    if _at_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="You've posted a few already. Give it a while before adding another.",
        )

    try:
        name, text = moderation.clean_submission(payload.name, payload.text)
    except moderation.SubmissionRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stored = feedback.add_item(name, payload.kind, text)
    _record_post(client_ip)
    return stored


@app.post("/api/feedback/{item_id}/vote")
async def vote_feedback(item_id: str):
    item = feedback.vote(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="That suggestion is no longer on the board.")
    return item


@app.get("/api/health")
async def health():
    return {"ok": True}
