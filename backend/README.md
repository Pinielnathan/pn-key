# PN Key backend

FastAPI service for [PN Key](https://pnkey.chitemere.co.zw) — BPM/key auto-detection and retuning (`librosa`), vocal/instrumental stem separation (`demucs`), voice effect presets (`pedalboard`), and BPM/key metadata tagging on every output (`mutagen`). See the [repo root README](../README.md) for the full picture.

## Deploying — Google Cloud Run (primary, live)

```
cd backend
gcloud run deploy pn-key-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ALLOWED_ORIGINS=https://pnkey.chitemere.co.zw,OMP_NUM_THREADS=8,MKL_NUM_THREADS=8 \
  --memory 4Gi \
  --cpu 8 \
  --timeout 300 \
  --no-cpu-throttling \
  --max-instances 1 \
  --concurrency 20
```

### Separation speed

A 3m20s track separates in about **140s**, down from ~380s. In order of what each change was worth:

| Change | Effect |
|---|---|
| `--cpu 8` (was 2) | 380s → 180s |
| `OMP_NUM_THREADS` / `MKL_NUM_THREADS` pinned to the vCPU count | 180s → 130s |
| Demucs `--overlap` 0.1 (was 0.25) | ~23% of the Demucs portion |
| Detection at 22.05kHz with a halved hop length | 9.8s → 2.8s |
| librosa/numba JIT warmed at startup | ~20s off the first request after a cold start |

More cores is close to cost-neutral rather than a splurge: Cloud Run bills CPU-seconds, so 4× the cores for roughly ¼ the wall time is about the same money per job, and less on memory-seconds. The old 2-vCPU setting was paying nearly the same to be four times slower.

**The two thread variables have to be in `--set-env-vars`, and `--set-env-vars` replaces the whole environment** — so every one of them has to be listed on every deploy, which is why `ALLOWED_ORIGINS` and both thread variables appear together in the command above. Dropping them is a silent 35% slowdown (130s → 200s) with nothing in the logs to say anything changed. Setting them as an image `ENV` in the Dockerfile instead looks like it should work and does not: that was tried and measured at the 200s figure, i.e. no effect at all.

**The rest is Demucs on a CPU, which is near its floor here.** `--segment` is already at 7, the largest window htdemucs accepts, and the overlap is already cut. Going meaningfully faster means changing the hardware or the model, and both are trade-offs rather than free wins:

- **A GPU** (`--gpu 1 --gpu-type nvidia-l4`) would put separation in the 10–20s range, but needs a CUDA build of Torch, is limited to certain regions, and bills at a much higher rate while active.
- **A lighter model** (`mdx_extra_q` via `DEMUCS_MODEL`) is faster than htdemucs but needs the `diffq` dependency and separates less cleanly — reasonable as an opt-in "fast mode", not as the default.

`--source .` builds `Dockerfile` directly on Cloud Run's build infra and deploys it — no local Docker install needed. `--allow-unauthenticated` is required since the frontend calls this over plain HTTPS with no auth. `--timeout 300` covers longer separation jobs. Cloud Run prints a stable `https://pn-key-backend-<hash>-<region>.a.run.app` URL that doesn't change between deploys — set that as `VITE_API_URL` on the frontend once.

**`--memory 4Gi` and `--max-instances 1` are both load-bearing, for the same reason: job state lives in one process's memory.**

At 2Gi, separating a full-length song pushed the container past its memory limit, the kernel killed it, and every job in that process died with it — the frontend's next poll got a 404 and the user saw "Job not found" on work that had been running fine seconds earlier. Cloud Run's log for it is `Memory limit of 2048 MiB exceeded`. The app side of that is bounded too (`DEMUCS_SEGMENT` caps the processing window, `MAX_CONCURRENT_JOBS` stops simultaneous uploads from multiplying peak memory), but the headroom matters.

`--max-instances 1` closes the other half: with several instances, the POST that creates a job and the GET that polls it can land on different containers, and the polling one has never heard of that job — the same "Job not found", with nothing wrong anywhere. One instance means one job table. If this ever needs to scale past that, job state has to move out of process memory first (GCS or Redis); raising max-instances on its own will reintroduce the bug.

Note also that Cloud Run rejects request bodies over **32 MiB** at its edge, before the app sees them, answering with an HTML error page rather than the app's JSON — hence `MAX_UPLOAD_BYTES` sitting just under that, and the matching client-side check in the frontend so oversized files fail with a readable message.

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

It prints a public `https://*.trycloudflare.com` URL. Since the frontend now only reads `VITE_API_URL` at build time (no runtime override anymore), using this URL means setting it as `VITE_API_URL` on the frontend and redeploying — and doing that again every time the script restarts with a new URL. That's the actual tradeoff of hosting this way for free, and why Cloud Run is the primary path now instead.

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
