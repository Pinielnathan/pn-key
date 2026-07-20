import json
import tempfile
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from . import audio_ops, effects
from .config import ALLOWED_ORIGINS, MAX_UPLOAD_BYTES, STORAGE_DIR
from .jobs import Job, create_job, get_job

STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PN Key API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_SAFE_EXTENSIONS = {
    ".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac", ".aiff", ".wma",
    ".webm", ".mp4",  # browser MediaRecorder output (mic recordings)
}


def _safe_suffix(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    return suffix if suffix in _SAFE_EXTENSIONS else ".wav"


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
    with dest.open("wb") as f:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File too large")
            f.write(chunk)
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty")


def _run_retune(
    job: Job,
    input_path: Path,
    source_bpm: float,
    target_bpm: float,
    semitone_shift: float,
) -> None:
    try:
        job.status = "processing"
        output_path = job.dir / "output.wav"
        job.outputs["output"] = audio_ops.retune(input_path, output_path, source_bpm, target_bpm, semitone_shift)
        job.status = "done"
    except Exception as exc:  # noqa: BLE001
        job.status = "error"
        job.error = str(exc)


def _run_separate(job: Job, input_path: Path) -> None:
    try:
        job.status = "processing"
        job.outputs.update(audio_ops.separate(input_path, job.dir / "stems"))
        job.status = "done"
    except Exception as exc:  # noqa: BLE001
        job.status = "error"
        job.error = str(exc)


def _run_effect(job: Job, input_path: Path, preset_slugs: list[str]) -> None:
    try:
        job.status = "processing"
        output_path = job.dir / "output.wav"
        job.outputs["output"] = audio_ops.apply_effect(input_path, output_path, preset_slugs)
        job.status = "done"
    except Exception as exc:  # noqa: BLE001
        job.status = "error"
        job.error = str(exc)


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
        raise HTTPException(status_code=404, detail="Job not found")
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
        raise HTTPException(status_code=404, detail="Job not found")
    formats = job.outputs.get(stem)
    if not formats:
        raise HTTPException(status_code=404, detail="Output not ready")
    path = formats.get(format)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail=f"Format '{format}' not available")
    media_type = "audio/mpeg" if format == "mp3" else "audio/wav"
    return FileResponse(path, filename=f"{stem}.{format}", media_type=media_type)


@app.get("/api/health")
async def health():
    return {"ok": True}
