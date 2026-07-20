# PN Key

A standalone tool with three features. Every download from any of them comes as WAV or MP3, both carrying BPM and key as standard ID3 `TBPM`/`TKEY` frames (the same metadata DJ software like Serato, rekordbox, and Traktor reads), and named after what's actually in the file (e.g. `PN-Key-Retuned-vocal-140bpm-Am.wav`) instead of a bare `output.wav`.

1. **Retune** — upload one or more vocal recordings (or record straight from the mic), BPM/key are detected automatically per file, tell it what BPM/key you want instead, and download each result. Preview a quick sample of the retune before committing to the full render. Target settings save to / load from a small JSON preset file, so a repeat setup doesn't mean re-entering values by hand.
2. **Separate** — upload one or more full songs and split each into an isolated vocals stem and an instrumental/beat stem, download either one.
3. **Effects** — upload one or more vocals, search or filter 30 presets across 5 categories (Space & Reverb, Character & Novelty, Lo-Fi & Retro, Vocal Polish, Mood), paginated 9 at a time. Select more than one preset to chain them in order as a single combined effect. Preview a quick sample before committing to the full render. Same save/load preset file as Retune.

All three accept multiple files at once (settings apply to every file, jobs run in parallel, each gets its own result card) and a "record from mic" button as an alternative to uploading, with a live waveform of your voice drawn while recording. A recording made in any tab can be reused in any other via a "Use last recording" button, so you don't have to record the same take twice.

**A page refresh doesn't lose your work.** Uploaded/recorded files, target BPM/key/effect settings, search/filter state, and in-progress or finished results all survive a reload — including re-attaching to jobs that were still processing when you left, and flagging any whose results have since expired server-side.

Batch-processed two or more files at once? A **"Download all as ZIP"** button appears once results are ready, so getting five retuned vocals (or a song's vocal + instrumental stems) home is one click instead of ten. It's also **installable as an app** on phone or desktop (the browser's "Add to Home Screen"/"Install app" prompt) — same site, no app store. Sharing the link (iMessage, WhatsApp, Discord, Slack, X) shows a proper preview card with the logo, name, and description instead of a bare URL.

Standalone project, unrelated to any other repo on this machine — its own frontend, backend, and deploy story.

## Architecture

- **`frontend/`** — React + Vite + TypeScript + Tailwind. A static single-page app: file upload (drag-drop, multi-file, or `MediaRecorder`-based mic recording via `MicRecorder.tsx`, which also draws a live waveform of the input via a Web Audio `AnalyserNode` while recording), controls, job-status polling, players, download links. Batch mode (`SeparatePanel`/`EffectsPanel`/`RetunePanel`) submits one job per file and tracks each independently. A `lastRecording` file is lifted to `App.tsx` and passed to all three panels, so whichever tab you recorded in, any other tab can pull it in with a "Use last recording" button. No audio processing happens in the browser — it's a thin client for the backend.
  - **Persistence across refresh**: `lib/fileStore.ts` stores uploaded/recorded `File` objects in IndexedDB (localStorage can't hold binary blobs at any real size; IndexedDB stores `File`/`Blob` natively via structured clone). `lib/useLocalStorageState.ts` is a drop-in `useState` replacement that mirrors small values (settings, search/filter state, the active tab) to localStorage. `lib/useResumableResults.ts` persists each panel's result list and, once on mount, re-verifies every job still referenced there against the backend — resuming polling for anything left `"processing"`, and marking anything the server no longer has (past its TTL, or a restart) as expired, instead of silently trusting stale state.
  - **Batch ZIP download**: `lib/zip.ts` is a from-scratch, dependency-free ZIP writer (local file headers + central directory + EOCD record, method 0/"stored" — audio is already MP3-compressed or barely-compressible WAV, so there's nothing DEFLATE would gain here). `lib/downloadZip.ts` fetches every finished result's WAV+MP3 in parallel, reads the server-suggested filename off each response's `Content-Disposition` header, de-duplicates any name collisions, and hands the assembled archive to the browser as a single download.
  - **Installable (PWA)**: `public/manifest.webmanifest` + a deliberately do-nothing pass-through `public/sw.js` (registered from `main.tsx`) satisfy browsers' installability checks without adding any caching layer — every request still goes straight to the network, so there's no risk of the service worker ever serving stale audio, job state, or API responses.
  - **Link preview card**: `index.html` carries Open Graph (`og:*`) and Twitter Card meta tags pointing at `public/og-image.png`, a 1200×630 image generated once with Pillow (brand mark on the near-black brand background, `PN Key` in lime, tagline, and the site URL in gold) — so pasting the link into iMessage/WhatsApp/Discord/Slack/X shows a real preview instead of a bare URL.
- **`backend/`** — FastAPI (Python). Three synchronous preview/analysis endpoints plus three async job types:
  - `analyze`: best-effort BPM (`librosa.beat.beat_track`) and key (chroma vector correlated against Krumhansl-Schmuckler major/minor key profiles) detection, returned immediately — no job queue, since it's fast.
  - `retune/preview` / `effects/preview`: render only the first ~8 seconds of the upload (through the requested retune settings, or one-or-more chained effect presets) and return an MP3 directly (no job, no persistence) — fast enough to audition changes without committing to a full render.
  - `retune`: loads the upload with `librosa`, time-stretches to the target BPM (`librosa.effects.time_stretch`) and pitch-shifts by the computed semitone difference (`librosa.effects.pitch_shift`), writes WAV + MP3.
  - `separate`: shells out to `python -m demucs --two-stems vocals` (the `htdemucs` model) to produce `vocals.wav` and `no_vocals.wav` (used as the instrumental/beat), plus an MP3 sibling of each. Both stems get tagged with the same detected BPM/key, since they're one song.
  - `effects`: runs one or more named presets in sequence — each a chain of [`pedalboard`](https://github.com/spotify/pedalboard) effects (Reverb, Chorus, Distortion, Delay, PitchShift, filters, Bitcrush, Phaser) — over the upload, writes WAV + MP3. Multiple presets are applied back-to-back as one combined pass rather than requiring a restructured "combo" preset definition. Presets are defined in `app/effects.py`; `GET /api/effects/presets` is the single source of truth the frontend reads from, nothing's hardcoded twice. The frontend sends the selected slugs as a JSON array string in the `presets` form field.
  - Every job re-analyzes its own output (or, for `separate`, the instrumental stem), embeds the detected BPM/key via `mutagen` into both the WAV (`app/audio_ops.py:embed_metadata`) and MP3 (`embed_metadata_mp3`) before marking itself done. MP3 encoding is `lameenc` (a transitive dependency of `pedalboard`, now used directly and pinned explicitly).
  - Jobs run in a background thread per request; the frontend polls `GET /api/jobs/{id}` until `status` is `done` or `error`, then downloads from `GET /api/jobs/{id}/download/{stem}?format=wav|mp3`. The download's filename is built from that stem's detected BPM/key and job title (`job.metadata[stem]`, set alongside `job.outputs[stem]` when the job finishes) — e.g. `PN-Key-Vocals-120bpm-A.mp3` — rather than the bare stem name. CORS explicitly exposes the `Content-Disposition` header (`expose_headers` on `CORSMiddleware`) so the frontend's ZIP feature can read that same filename cross-origin instead of guessing one.
  - Job files live under `STORAGE_DIR` (default `/tmp/pn-key-jobs`) and are deleted after `JOB_TTL_SECONDS` (default 2 hours).
  - Uploads accept `.webm`/`.mp4` (typical browser `MediaRecorder` output) alongside the usual audio formats, decoded via the same ffmpeg-backed `audioread` fallback librosa already uses for anything `soundfile` can't read directly.

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

Demucs pulls in PyTorch, which needs a Python version PyTorch actually publishes wheels for. **Docker is the recommended way to run the backend**, since it pins Python 3.11 and installs `ffmpeg` (required by `librosa`/`demucs` to decode mp3/m4a/etc.):

```
cd backend
docker build -t pn-key-backend .
docker run -p 8000:7860 -e ALLOWED_ORIGINS=http://localhost:5173 pn-key-backend
```

If you'd rather run it without Docker, create a venv with a Python version PyTorch actually ships wheels for (check first — don't assume your system default works) and:

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

- **Frontend**: deployed to Vercel at [pnkey.chitemere.co.zw](https://pnkey.chitemere.co.zw). Any static host works — `npm run build` produces `frontend/dist`. `VITE_API_URL` is baked in at build time as the backend URL; changing it means rebuilding and redeploying. (An earlier version read a `localStorage` override instead, from back when the backend's URL rotated on every restart of a free Cloudflare tunnel — removed once Cloud Run made the URL permanent, since a stale saved override is worse than no override at all.)
- **Backend — always-on, live now**: [Google Cloud Run](https://cloud.google.com/run), deployed straight from `backend/Dockerfile` (`gcloud run deploy pn-key-backend --source .` — see `backend/README.md` for the exact command). Cloud Run's Always Free tier (2M requests/month, 360k GB-seconds memory, 180k vCPU-seconds compute — no end date, per Google's own docs) comfortably covers personal-scale use, scales to zero when idle, and needs no server babysitting. Requires a Google Cloud billing account with a card on file for verification (standard policy, not a charge) — new accounts also get a separate 90-day/$300 trial credit on top, but the Always Free quota itself isn't time-limited and persists on any account in good standing, trial or not.
  - **Gotcha that will bite you if you deploy this pattern elsewhere on Cloud Run**: by default Cloud Run throttles a container's CPU to near-zero once it's done sending the HTTP response, on the assumption that nothing needs to run after that. This app's jobs are deliberately async — the POST returns immediately with a `job_id` while a background thread keeps working, and the frontend polls separately — so the actual Demucs/effects computation was getting starved of CPU between polls and jobs would sit at `"processing"` indefinitely. Fixed with `gcloud run services update pn-key-backend --no-cpu-throttling`, which keeps CPU allocated for the life of the container instance, not just per-request.
- **Backend — free, no card, self-hosted fallback**: `backend/run_local.ps1` runs the backend on your own machine and exposes it via a free [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) — no cloud account, no Docker even required. Tradeoff: only reachable while your machine and that script are running, and the public URL changes on every restart (paste the new one into the site's settings panel, or ask for a redeploy). Was the interim solution before Cloud Run; kept around in case you ever want zero cloud dependency again.
- **Backend — other options ruled out**: Hugging Face Spaces' Docker SDK now requires PRO (was free, isn't anymore). Render, Fly.io, and Replit's free tiers cap around 256–512MB RAM, not enough for PyTorch + Demucs. Railway/Render/Fly.io paid tiers (~$5-7/mo) are the straightforward option if you'd rather just pay for zero hassle.

## Known limitations

- **Stereo retuning does time-stretch/pitch-shift per channel independently.** For a true stereo vocal recording this can very slightly blur left/right phase coherence. For mono or near-mono vocals (the common case) this isn't noticeable.
- **Separation quality depends on the source mix.** Demucs is a strong general-purpose model, but dense/loud masters will bleed more than sparse ones.
- **BPM/key metadata is best-effort**, detected from the output audio itself (or the target values, for retune) — not a substitute for checking by ear on material where automatic detection struggles (a cappella vocals with no strong beat, heavily effected output).
- **First separation request after a fresh deploy may be slow** if the Docker build's model pre-fetch step didn't run (e.g. no network at build time) — it falls back to downloading `htdemucs` weights (~80 MB) on first use.
- **Job storage is in-memory + on-disk, single process.** Fine for personal-scale use; a restart loses in-flight job bookkeeping (though not usually mid-job, since jobs are short-lived).
- **Mic recording depends on the browser's `MediaRecorder` support**, which varies: most browsers produce `.webm`/opus, Safari typically produces `.mp4`/aac. Both are accepted server-side, but this hasn't been exercised through an actual browser microphone in this environment (verified via a synthetic `.webm` file matching the same codec instead — no browser/mic available here).
- **Previews (retune and effects) only render the first ~8 seconds** of a file — representative for most vocals, but a preset with a long build-up, or a retune whose time-stretch artifacts vary over the track, won't preview perfectly accurately.
- **Live recording waveform is a separate signal path from what's recorded.** The `AnalyserNode` used to draw it taps the same `MediaStream` as `MediaRecorder` but doesn't touch the encoded output, so the visualization can't drift out of sync with or degrade the actual recording.
- **Batch mode trusts auto-detected BPM/key per file with no per-file manual correction.** Single-file Retune keeps the editable override; adding N sets of correction fields for a batch felt like more clutter than it's worth.
- **Persisted state is per-browser, not per-account** (there are no accounts) — it lives in that browser's IndexedDB/localStorage, so it won't follow you to a different browser or device, and clearing site data resets it.
- **The batch ZIP download re-fetches every WAV/MP3 from the backend** rather than reusing bytes already in the browser, and holds the whole archive in memory before saving — fine for the batch sizes this app targets, but not built for hundreds of large files at once.
- Only process audio you actually have the rights to — this tool doesn't check that for you.

## Verified locally

- Frontend: `npm run build` (TypeScript + Vite) succeeds; dev server serves and transforms all components correctly. Deployed and confirmed live at pnkey.chitemere.co.zw.
- Backend, full pipeline, for real: this machine's default Python is too new for PyTorch's published wheels, but an older-minor-version Python (also installed here) works fine — `torch`/`torchaudio` (CPU), `demucs`, `pedalboard`, and `mutagen` all installed cleanly via pip, no Docker needed. With that:
  - `/api/analyze` against a synthetic 120 BPM click track tuned to A: detected 117.5 BPM (within normal tempo-detection tolerance) and exactly key A.
  - `/api/jobs/retune` against a real WAV: BPM 120→140 produced exactly the expected duration ratio, and the output's embedded `TBPM` tag read back exactly 140 — confirming the metadata reflects the actual processed audio, not just a claimed value.
  - `/api/jobs/separate` against a real Demucs run (not mocked): fed it a synthetic mix of a sine-tone "vocal" and a bass/noise "beat" — Demucs correctly recognized the sine tone didn't sound like real singing and routed most of it to the instrumental stem (vocals RMS 0.002 vs instrumental RMS 0.211), confirming genuine model inference rather than a passthrough. Both output stems carried identical `TBPM`/`TKEY` tags, as intended.
  - `/api/jobs/effects` against the "haunted" preset: job completed, output audibly processed (RMS changed as expected for a wet reverb/phaser mix), and the output carried its own detected metadata tags.
  - MP3 export: encoded a test tone with `lameenc`, decoded it back with `librosa` to confirm it's a real, valid MP3 (not just bytes with an `.mp3` name), then confirmed the same for actual job outputs — a retune to 140 BPM read back `TBPM: 140` on *both* the WAV and its MP3 sibling, and both `separate` stems' MP3s carried matching tags to their WAVs.
  - Mic-recording format support: encoded a WAV to `.webm`/opus with ffmpeg (matching real browser `MediaRecorder` output) and confirmed `librosa.load` decodes it correctly via the ffmpeg-backed `audioread` fallback — this only works with ffmpeg on `PATH`, which the Docker image already has baked in.
  - `/api/effects/preview`: confirmed it returns a valid, quickly-generated MP3 without creating a job or persisting anything.
  - `/api/retune/preview`: confirmed correct duration math against known source/target BPM (~3.27s preview from an 8s slice at the tested ratio).
  - Multi-preset chaining (`effects.apply_presets`): a single preset's output matched the old single-preset path unchanged; a 3-preset chain (`warm-vintage` → `cathedral` → `doubler`) produced valid, genuinely different audio than any single preset alone; an empty list and an unknown slug both correctly raised/returned errors (`400 Unknown preset(s): ...`) instead of silently doing nothing.
  - Download filenames: confirmed against a synthetic 120 BPM/A click track that `retune`, `effects`, and `separate` jobs all produce descriptive `Content-Disposition` filenames carrying the real detected BPM/key (`PN-Key-Effect-118bpm-A.wav`, `PN-Key-Vocals-120bpm-A.wav`, `PN-Key-Instrumental-120bpm-A.mp3`) instead of the old bare `output.wav`/`vocals.wav`.
- **In production, on Cloud Run itself** (not just locally): `/api/health`, `/api/analyze`, `/api/jobs/effects`, and a full `/api/jobs/separate` run were all hit directly against the deployed `https://pn-key-backend-*.run.app` URL after the CPU-throttling fix above — separate went from stuck at `"processing"` indefinitely to completing in ~80s, output files downloaded and confirmed to carry matching `TBPM`/`TKEY` tags on both stems. CORS confirmed correct (`Access-Control-Allow-Origin` matching the live frontend's origin) and the deployed frontend's JS bundle confirmed to actually reference the Cloud Run URL, not a stale one.
- `lib/fileStore.ts` (the IndexedDB layer behind refresh-persistence): bundled to plain JS and run under Node against `fake-indexeddb` — confirmed `saveFiles`/`loadFiles` round-trip a `File`'s name, MIME type, size, and actual bytes intact; saving to an existing key replaces rather than appends; loading a never-used key returns `[]` rather than throwing; `saveFile`/`loadFile` (used for the shared "last recording") round-trip correctly and `saveFile(key, null)` clears the stored entry.
- `lib/zip.ts`: bundled to plain JS and run under Node to build a real archive (a 50,000-byte fill, a text file, and an 8-byte binary stub), then extracted it with Windows' built-in `Expand-Archive` (a real, independent unzip implementation, not a hand-rolled reader) — every file came back with the exact right name, size, and byte-for-byte content, confirming the local file headers, central directory, and CRC-32s are actually spec-correct rather than just "looks right."
- CORS `expose_headers`: submitted a real effects job locally with `ALLOWED_ORIGINS` set to the production frontend origin, then fetched its download with an `Origin` header attached — confirmed the response carries both `Access-Control-Allow-Origin: https://pnkey.chitemere.co.zw` and `Access-Control-Expose-Headers: Content-Disposition`, so the ZIP feature's cross-origin filename read will actually work in production, not just same-origin locally.
- Browser UI was not visually clicked through (no browser automation available in this environment) — build/serve/transform/network correctness was verified instead of a manual click-path. The localStorage-backed settings/results hooks (`useLocalStorageState`, `useResumableResults`) are simple read-JSON/write-JSON wrappers verified by code review and a clean `tsc`/build rather than an isolated test, but the actual IndexedDB file persistence they sit alongside was independently verified as above. Likewise, the PWA manifest + service worker registration is a standard, well-documented browser pattern and the built `dist/` output was confirmed to actually contain `manifest.webmanifest` and `sw.js`, but an actual "Install app" prompt firing on a real phone/desktop browser hasn't been clicked through here.
