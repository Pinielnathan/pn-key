FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Bake the htdemucs model weights into the image so the first request isn't
# slowed down by a cold download. If this fails at build time (e.g. no
# network), the model is fetched lazily on first use instead.
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')" || true

ENV STORAGE_DIR=/data/jobs
RUN mkdir -p /data/jobs

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
