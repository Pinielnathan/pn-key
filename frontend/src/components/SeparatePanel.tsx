import { useState } from "react";
import { downloadUrl, pollJobUntilDone, submitSeparateJob } from "../lib/api";
import { FileDrop } from "./FileDrop";

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

export function SeparatePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const canSubmit = file !== null && stage !== "uploading" && stage !== "processing";

  async function handleSubmit() {
    if (!file) return;
    setError(null);
    setStage("uploading");
    try {
      const { job_id } = await submitSeparateJob(file);
      setJobId(job_id);
      setStage("processing");
      const finalStatus = await pollJobUntilDone(job_id, () => {});
      if (finalStatus.status === "error") {
        setError(finalStatus.error ?? "Processing failed");
        setStage("error");
      } else {
        setStage("done");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("error");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Separate a song</h2>
        <p className="text-sm text-zinc-400">
          Upload a full song and split it into an isolated vocal stem and an instrumental/beat stem.
          Separation quality depends on the mix, and processing can take a while since it runs full
          source-separation on the server.
        </p>
      </div>

      <FileDrop label="Song file" file={file} onFileSelected={setFile} />

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-md bg-brand-lime px-4 py-2 font-semibold text-ink-950 transition-colors hover:bg-brand-limeDark disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-zinc-500"
      >
        {stage === "uploading" || stage === "processing" ? "Separating…" : "Separate"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {stage === "done" && jobId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border border-zinc-700 bg-ink-900 p-4">
            <p className="text-sm font-medium text-zinc-200">Vocals</p>
            <audio controls src={downloadUrl(jobId, "vocals")} className="w-full" />
            <a
              href={downloadUrl(jobId, "vocals")}
              download
              className="inline-block rounded-md bg-ink-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-ink-700"
            >
              Download vocals
            </a>
          </div>
          <div className="space-y-2 rounded-md border border-zinc-700 bg-ink-900 p-4">
            <p className="text-sm font-medium text-zinc-200">Instrumental / beat</p>
            <audio controls src={downloadUrl(jobId, "instrumental")} className="w-full" />
            <a
              href={downloadUrl(jobId, "instrumental")}
              download
              className="inline-block rounded-md bg-ink-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-ink-700"
            >
              Download instrumental
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
