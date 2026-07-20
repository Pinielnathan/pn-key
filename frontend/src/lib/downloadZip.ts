import { downloadUrl, type AudioFormat } from "./api";
import { createZip, type ZipEntry } from "./zip";

async function fetchEntry(jobId: string, stem: string, format: AudioFormat): Promise<ZipEntry | null> {
  const res = await fetch(downloadUrl(jobId, stem, format));
  if (!res.ok) return null;
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const name = match ? match[1] : `${stem}.${format}`;
  const data = new Uint8Array(await res.arrayBuffer());
  return { name, data };
}

function dedupeName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : "";
  let n = 2;
  while (used.has(`${base} (${n})${ext}`)) n++;
  return `${base} (${n})${ext}`;
}

/**
 * Fetches every WAV+MP3 for the given jobs/stems (already-finished job outputs — nothing is
 * (re)computed here) and packs them into one ZIP, triggering a single browser download.
 * Two jobs producing identically-named files (same detected bpm/key/title) get disambiguated
 * with a " (2)" suffix rather than silently colliding inside the archive.
 */
export async function downloadAllAsZip(jobIds: string[], stems: string[], zipFilename: string): Promise<void> {
  const tasks: Promise<ZipEntry | null>[] = [];
  for (const jobId of jobIds) {
    for (const stem of stems) {
      for (const format of ["wav", "mp3"] as const) {
        tasks.push(fetchEntry(jobId, stem, format));
      }
    }
  }

  const fetched = (await Promise.all(tasks)).filter((entry): entry is ZipEntry => entry !== null);
  if (fetched.length === 0) throw new Error("Nothing to download yet.");

  const used = new Set<string>();
  const entries = fetched.map((entry) => {
    const name = dedupeName(entry.name, used);
    used.add(name);
    return { ...entry, name };
  });

  const blob = createZip(entries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
