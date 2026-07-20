# PN Key backend

FastAPI service for [PN Key](https://pnkey.chitemere.co.zw) — BPM/key auto-detection and retuning (`librosa`), and vocal/instrumental stem separation (`demucs`). See the [repo root README](../README.md) for the full picture.

## Running it (free, self-hosted)

`run_local.ps1` runs the backend on your own machine and exposes it publicly via a free Cloudflare quick tunnel — no cloud account, no Docker required. One-time setup and full details are in the comments at the top of that script; short version:

```
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install numpy librosa soundfile fastapi uvicorn python-multipart demucs
.venv\Scripts\python.exe -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
# also needs ffmpeg + cloudflared on PATH: winget install Gyan.FFmpeg / Cloudflare.cloudflared

powershell -ExecutionPolicy Bypass -File .\run_local.ps1
```

It prints a public `https://*.trycloudflare.com` URL — paste that into the "Backend unreachable" panel on the live site. That URL changes every time you restart the script, which is the actual tradeoff of hosting this way for free: it's only reachable while your machine and the script are running.

## Docker

`Dockerfile` still exists for anyone who'd rather deploy to a real host — Railway/Render/Fly.io (paid) or a VM you control. It's set up to also work as a Hugging Face Space (the port, the non-root user) in case Hugging Face's Docker SDK moves back to a free tier, or if you have a PRO account — the YAML frontmatter below is the Space config, inert everywhere else:

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
