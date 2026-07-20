FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Non-root user: required by Hugging Face Spaces' Docker runtime, and just
# good practice everywhere else too. Everything the app touches (deps,
# code, job storage) lives under this user's home directory.
RUN useradd -m -u 1000 appuser
USER appuser
ENV HOME=/home/appuser \
    PATH=/home/appuser/.local/bin:$PATH \
    STORAGE_DIR=/home/appuser/jobs \
    PORT=7860

WORKDIR /home/appuser/app

COPY --chown=appuser requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=appuser app ./app

# Bake the htdemucs model weights into the image so the first request isn't
# slowed down by a cold download. If this fails at build time (e.g. no
# network), the model is fetched lazily on first use instead.
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')" || true

RUN mkdir -p "$STORAGE_DIR"

# 7860 is Hugging Face Spaces' expected Docker port (see README.md's
# `app_port`). Other hosts (Railway/Render/etc.) inject their own $PORT at
# runtime, which overrides this default.
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
