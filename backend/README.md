# PN Key backend

FastAPI service for [PN Key](https://pnkey.chitemere.co.zw) — BPM/key auto-detection and retuning (`librosa`), vocal/instrumental stem separation (`demucs`), voice effect presets (`pedalboard`), and BPM/key metadata tagging on every output (`mutagen`). See the [repo root README](../README.md) for the full picture.

## Deploying — Google Cloud Run (primary, live)

```
cd backend
gcloud run deploy pn-key-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ALLOWED_ORIGINS=https://pnkey.chitemere.co.zw \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --no-cpu-throttling
```

`--source .` builds `Dockerfile` directly on Cloud Run's build infra and deploys it — no local Docker install needed. `--allow-unauthenticated` is required since the frontend calls this over plain HTTPS with no auth. `--memory 2Gi --cpu 2` gives PyTorch/Demucs enough headroom; `--timeout 300` covers longer separation jobs. Cloud Run prints a stable `https://pn-key-backend-<hash>-<region>.a.run.app` URL that doesn't change between deploys — set that as `VITE_API_URL` on the frontend once.

**`--no-cpu-throttling` is not optional for this app.** Cloud Run defaults to freezing a container's CPU once it finishes sending an HTTP response. This backend's jobs are async by design — the POST returns a `job_id` immediately while a background thread does the real work, polled separately — so without this flag, jobs sit at `"processing"` forever, starved of CPU between poll requests. Ask me how I know: first deploy did exactly that, `separate` never finished until this flag was added via `gcloud run services update pn-key-backend --no-cpu-throttling`.

First deploy from a brand-new GCP project may also fail once with a `storage.objects.get` permission error on the auto-created build bucket — the default Compute service account doesn't get its usual broad permissions on new-style projects. Fix once with:
```
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
```
then retry the deploy.

## Running it locally / self-hosted fallback

`run_local.ps1` runs the backend on your own machine and exposes it publicly via a free Cloudflare quick tunnel — no cloud account, no Docker required. One-time setup and full details are in the comments at the top of that script; short version:

```
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install numpy librosa soundfile fastapi uvicorn python-multipart demucs pedalboard mutagen
.venv\Scripts\python.exe -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
# also needs ffmpeg + cloudflared on PATH: winget install Gyan.FFmpeg / Cloudflare.cloudflared

powershell -ExecutionPolicy Bypass -File .\run_local.ps1
```

It prints a public `https://*.trycloudflare.com` URL — paste that into the "Backend unreachable" panel on the live site. That URL changes every time you restart the script — the actual tradeoff of hosting this way for free, and why Cloud Run is the primary path now instead.

## Docker

`Dockerfile` works for any container host — Cloud Run (above), Railway/Render/Fly.io (paid), or a VM you control. It also happens to work as a Hugging Face Space (the port, the non-root user) in case Hugging Face's Docker SDK ever moves back to a free tier, or if you have a PRO account — the YAML below is the Space config, inert everywhere else:

```yaml
---
title: PN Key Backend
emoji: 🎚️
colorFrom: yellow
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---
```

To push to a Space: `git remote add hf https://huggingface.co/spaces/<user>/pn-key-backend && git push hf main` (credentials: your HF username + a **write** access token as the password).
