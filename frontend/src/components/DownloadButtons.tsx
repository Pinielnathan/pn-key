import { downloadUrl } from "../lib/api";

export function DownloadButtons({ jobId, stem }: { jobId: string; stem: string }) {
  return (
    <div className="flex gap-2">
      <a
        href={downloadUrl(jobId, stem, "wav")}
        download
        className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-ink-700"
      >
        WAV
      </a>
      <a
        href={downloadUrl(jobId, stem, "mp3")}
        download
        className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-ink-700"
      >
        MP3
      </a>
    </div>
  );
}
