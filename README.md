# PN Key

A standalone tool with two features:

1. **Retune** — upload a vocal recording, tell it the current BPM/key and the BPM/key you want, and download the result.
2. **Separate** — upload a full song and split it into an isolated vocals stem and an instrumental/beat stem, download either one.

Standalone project, unrelated to any other repo on this machine — its own frontend, backend, and deploy story.

## Architecture

- **`frontend/`** — React + Vite + TypeScript + Tailwind. A static single-page app: file upload, BPM/key controls, job-status polling, players, download links. No audio processing happens in the browser — it's a thin client for the backend.
- **`backend/`** — FastAPI (Python). Two async job types:
  - `retune`: loads the upload with `librosa`, time-stretches to the target BPM (`librosa.effects.time_stretch`) and pitch-shifts by the computed semitone difference (`librosa.effects.pitch_shift`), writes a WAV.
  - `separate`: shells out to `python -m demucs --two-stems vocals` (the `htdemucs` model) to produce `vocals.wav` and `no_vocals.wav` (used as the instrumental/beat).
  - Jobs run in a background thread per request; the frontend polls `GET /api/jobs/{id}` until `status` is `done` or `error`, then downloads from `GET /api/jobs/{id}/download/{stem}`.
  - Job files live under `STORAGE_DIR` (default `/tmp/pn-key-jobs`) and are deleted after `JOB_TTL_SECONDS` (default 2 hours).

Everything server-side is real DSP/ML — there's no third-party API call and no client-side approximation.

## Running locally

### Frontend

```
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL if the backend isn't on localhost:8000
npm run dev
```

### Backend

Demucs pulls in PyTorch, which needs a Python version PyTorch actually publishes wheels for (currently 3.10–3.12). **Docker is the recommended way to run the backend**, since it pins Python 3.11 and installs `ffmpeg` (required by both `librosa` and `demucs` to decode mp3/m4a/etc.):

```
cd backend
docker build -t pn-key-backend .
docker run -p 8000:8000 -e ALLOWED_ORIGINS=http://localhost:5173 pn-key-backend
```

If you'd rather run it without Docker, create a venv with Python 3.11 or 3.10 specifically (not whatever `python3.14` you may have as your system default — PyTorch/Demucs won't install on it) and:

```
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Environment variables (all optional, see `app/config.py`):

| Variable | Default | Purpose |
|---|---|---|
| `STORAGE_DIR` | `/tmp/pn-key-jobs` | Where uploaded/output files are stored |
| `JOB_TTL_SECONDS` | `7200` | How long finished job files stick around before cleanup |
| `ALLOWED_ORIGINS` | `*` | CORS allow-list; set this to your deployed frontend origin in production |
| `MAX_UPLOAD_BYTES` | `104857600` (100 MB) | Upload size cap |
| `DEMUCS_MODEL` | `htdemucs` | Which pretrained Demucs model to use |

## Branding

Theme and logo (`vocal logo.png`, used as-is with its existing transparency — no background added) come from the brand mark. Palette extracted from the logo's dominant colors: lime `#d4e01c` / darker lime `#96a812` / gold `#c9a227` on a near-black `#08090a` background.

## Deploying

- **Frontend**: any static host works (Vercel, Netlify, etc.) — `npm run build` produces `frontend/dist`. Set `VITE_API_URL` to your deployed backend URL at build time.
- **Backend**: needs an always-on host that can run Docker containers with a few GB of RAM — Railway, Render, or Fly.io all work well for this. Point them at `backend/Dockerfile`. Demucs runs on CPU by default (no GPU required, but separation of a 3–4 minute song can take a minute or two on typical shared-CPU hosting — that's expected, not a bug).

## Known limitations

- **Stereo retuning does time-stretch/pitch-shift per channel independently.** For a true stereo vocal recording this can very slightly blur left/right phase coherence. For mono or near-mono vocals (the common case) this isn't noticeable.
- **Separation quality depends on the source mix.** Demucs is a strong general-purpose model, but dense/loud masters will bleed more than sparse ones.
- **First separation request after a fresh deploy may be slow** if the Docker build's model pre-fetch step didn't run (e.g. no network at build time) — it falls back to downloading `htdemucs` weights (~80 MB) on first use.
- **Job storage is in-memory + on-disk, single process.** Fine for personal-scale use; a restart loses in-flight job bookkeeping (though not usually mid-job, since jobs are short-lived).
- Only process audio you actually have the rights to — this tool doesn't check that for you.

## Verified locally

- Frontend: `npm run build` (TypeScript + Vite) succeeds; dev server serves and transforms all components correctly.
- Backend: on this machine's Python 3.14, `fastapi`/`librosa`/`soundfile`/`numpy` install and the app boots with all routes registered. A full retune job was run end-to-end against a real WAV (BPM 120→150 produced a 4.0s → 3.2s file, exactly the expected ratio) and the `/separate` job's error path was confirmed (fails cleanly with a captured error message, not a crash) when Demucs isn't installed.
- **Not verified locally**: the actual Demucs separation path and PyTorch itself, since this machine's default Python (3.14) is newer than PyTorch's currently published wheels support. Use the Dockerfile (pinned to Python 3.11) for that — it's the supported path for the separation feature. Browser UI was not visually clicked through (no browser automation available in this environment) — build/serve/transform correctness was verified instead.
