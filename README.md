# PN Key

A standalone tool with two features:

1. **Retune** — upload a vocal recording, its BPM/key are detected automatically, tell it what BPM/key you want instead, and download the result.
2. **Separate** — upload a full song and split it into an isolated vocals stem and an instrumental/beat stem, download either one.

Standalone project, unrelated to any other repo on this machine — its own frontend, backend, and deploy story.

## Architecture

- **`frontend/`** — React + Vite + TypeScript + Tailwind. A static single-page app: file upload, BPM/key controls, job-status polling, players, download links. No audio processing happens in the browser — it's a thin client for the backend.
- **`backend/`** — FastAPI (Python). One synchronous endpoint plus two async job types:
  - `analyze`: best-effort BPM (`librosa.beat.beat_track`) and key (chroma vector correlated against Krumhansl-Schmuckler major/minor key profiles) detection, returned immediately — no job queue, since it's fast.
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
docker run -p 8000:7860 -e ALLOWED_ORIGINS=http://localhost:5173 pn-key-backend
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

- **Frontend**: deployed to Vercel at [pnkey.chitemere.co.zw](https://pnkey.chitemere.co.zw). Any static host works — `npm run build` produces `frontend/dist`. `VITE_API_URL` sets the *default* backend URL baked in at build time, but it's just a fallback: the app also reads a `pnkey:apiBase` value from `localStorage` (see `frontend/src/lib/backendUrl.ts`), editable via the "Backend unreachable" panel that appears in the UI if the configured URL doesn't respond. That's what makes self-hosting (below) workable without a redeploy every time the backend's public URL changes.
- **Backend — free, no card, self-hosted**: run it on your own machine and expose it with a free [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) — no cloud account, no Docker even required. `backend/run_local.ps1` does this: starts the backend, starts `cloudflared`, retries a few times if Cloudflare's quick-tunnel endpoint hiccups (it does, semi-regularly), and prints the public URL to paste into the site's settings panel. One-time setup is documented at the top of that script. Tradeoff, and the whole reason this is free: the backend is only reachable while your machine and that script are running, and the public URL changes every time you restart it.
- **Backend — other options considered and ruled out**: Hugging Face Spaces' Docker SDK now requires a PRO subscription (was free, isn't anymore — don't be misled by older docs/guides that say otherwise). Render, Fly.io, and Replit's free tiers cap out around 256–512MB RAM, which isn't enough for PyTorch + Demucs to load reliably. Google Cloud Run and Oracle Cloud "Always Free" both genuinely work and stay within free quota for personal-scale use, but both require a credit card on file for account verification (never charged if you stay in bounds, but it's a card nonetheless) — reasonable fallbacks if you decide the self-hosting tradeoff isn't worth it. Railway/Render/Fly.io paid tiers are the straightforward option if you'd rather just pay a few $/month for zero hassle — point any of them at `backend/Dockerfile`.

## Known limitations

- **Stereo retuning does time-stretch/pitch-shift per channel independently.** For a true stereo vocal recording this can very slightly blur left/right phase coherence. For mono or near-mono vocals (the common case) this isn't noticeable.
- **Separation quality depends on the source mix.** Demucs is a strong general-purpose model, but dense/loud masters will bleed more than sparse ones.
- **First separation request after a fresh deploy may be slow** if the Docker build's model pre-fetch step didn't run (e.g. no network at build time) — it falls back to downloading `htdemucs` weights (~80 MB) on first use.
- **Job storage is in-memory + on-disk, single process.** Fine for personal-scale use; a restart loses in-flight job bookkeeping (though not usually mid-job, since jobs are short-lived).
- Only process audio you actually have the rights to — this tool doesn't check that for you.

## Verified locally

- Frontend: `npm run build` (TypeScript + Vite) succeeds; dev server serves and transforms all components correctly. Deployed and confirmed live at pnkey.chitemere.co.zw.
- Backend, full pipeline, for real: this machine's default Python (3.14) is too new for PyTorch's published wheels, but Python 3.13 (also installed here) works fine — `torch`/`torchaudio` (CPU) and `demucs` installed cleanly via pip, no Docker needed. With that:
  - `/api/analyze` against a synthetic 120 BPM click track tuned to A: detected 117.5 BPM (within normal tempo-detection tolerance) and exactly key A.
  - `/api/jobs/retune` against a real WAV: BPM 120→150 produced a 4.0s → 3.2s file, exactly the expected ratio.
  - `/api/jobs/separate` against a real Demucs run (not mocked): fed it a synthetic mix of a sine-tone "vocal" and a bass/noise "beat" — Demucs correctly recognized the sine tone didn't sound like real singing and routed most of it to the instrumental stem (vocals RMS 0.002 vs instrumental RMS 0.211), confirming genuine model inference rather than a passthrough.
  - End-to-end through a live Cloudflare tunnel: `run_local.ps1` → public HTTPS URL → confirmed reachable, correct CORS (`Access-Control-Allow-Origin` matching the deployed frontend's origin), health check round-trip all passed.
- Browser UI was not visually clicked through (no browser automation available in this environment) — build/serve/transform/network correctness was verified instead of a manual click-path.
