---
title: PN Key Backend
emoji: 🎚️
colorFrom: yellow
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# PN Key backend

FastAPI service for [PN Key](https://pnkey.chitemere.co.zw) — BPM/key auto-detection and retuning (`librosa`), and vocal/instrumental stem separation (`demucs`). See the [repo root README](../README.md) for the full picture.

This directory is deployed as its own [Hugging Face Space](https://huggingface.co/docs/hub/spaces-sdks-docker) (free CPU tier, Docker SDK) — the YAML frontmatter above is Hugging Face's Space config, not just decoration. To deploy:

```
cd backend
git init                                                        # if not already a repo of its own
git add .
git commit -m "Deploy PN Key backend"
git branch -M main                                              # Spaces expect `main`, not `master`
git remote add hf https://huggingface.co/spaces/<your-username>/pn-key-backend
git push hf main
```

When git asks for credentials: username = your HF username, password = an access token with **write** access (create one at huggingface.co → Settings → Access Tokens) — not your account password.

Hugging Face builds the `Dockerfile` in this directory and exposes it on port 7860. Free-tier Spaces sleep after a period of inactivity and cold-start on the next request (30–60s+) — expected, not a bug, for a personal-scale tool with no ongoing cost.
