import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { downloadUrl, pollJobUntilDone, submitSeparateJob } from "../lib/api";
import { downloadAllAsZip } from "../lib/downloadZip";
import { loadFiles, saveFiles } from "../lib/fileStore";
import { useResumableResults } from "../lib/useResumableResults";
import { DownloadButtons } from "./DownloadButtons";
import { MultiFileDrop } from "./MultiFileDrop";
import { ResultStatus } from "./ResultStatus";
import { Spinner } from "./Spinner";

interface SeparatePanelProps {
  lastRecording: File | null;
  onRecorded: (file: File) => void;
}

const FILES_KEY = "pnkey:separate:files";

export function SeparatePanel({ lastRecording, onRecorded }: SeparatePanelProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useResumableResults("pnkey:separate:results");
  const [isRunning, setIsRunning] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFiles(FILES_KEY)
      .then((stored) => {
        if (stored.length > 0) setFiles(stored);
      })
      .catch(() => {});
  }, []);

  function updateFiles(newFiles: File[]) {
    setFiles(newFiles);
    saveFiles(FILES_KEY, newFiles).catch(() => {});
  }

  const canSubmit = files.length > 0 && !isRunning;

  async function runOne(file: File, index: number) {
    try {
      const { job_id } = await submitSeparateJob(file);
      setResults((prev) => prev.map((r, i) => (i === index ? { ...r, jobId: job_id, status: "processing" } : r)));
      const finalStatus = await pollJobUntilDone(job_id, () => {});
      setResults((prev) =>
        prev.map((r, i) =>
          i === index
            ? finalStatus.status === "error"
              ? { ...r, status: "error", error: finalStatus.error ?? "Processing failed" }
              : { ...r, status: "done" }
            : r,
        ),
      );
    } catch (err) {
      setResults((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, status: "error", error: err instanceof Error ? err.message : "Something went wrong" } : r,
        ),
      );
    }
  }

  async function handleSubmit() {
    if (files.length === 0) return;
    const initial = files.map((file) => ({ fileName: file.name, status: "queued" as const, jobId: null, error: null }));
    setResults(initial);
    setIsRunning(true);
    await Promise.all(files.map((file, index) => runOne(file, index)));
    setIsRunning(false);
  }

  const doneJobIds = results.filter((r) => r.status === "done" && r.jobId).map((r) => r.jobId as string);

  async function handleDownloadZip() {
    setError(null);
    setIsZipping(true);
    try {
      await downloadAllAsZip(doneJobIds, ["vocals", "instrumental"], "pnkey-separated.zip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the ZIP.");
    } finally {
      setIsZipping(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Separate songs</h2>
        <p className="text-sm text-zinc-400">
          Upload one or more full songs and split each into an isolated vocal stem and an
          instrumental/beat stem. Separation quality depends on the mix, and processing can take a while
          since it runs full source-separation on the server.
        </p>
      </div>

      <MultiFileDrop
        label="Song file(s)"
        files={files}
        onFilesChange={updateFiles}
        onRecorded={onRecorded}
        lastRecording={lastRecording}
      />

      <motion.button
        onClick={handleSubmit}
        disabled={!canSubmit}
        whileTap={canSubmit ? { scale: 0.98 } : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-lime px-4 py-3 font-semibold text-ink-950 shadow-glow transition-colors hover:bg-brand-limeDark disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-zinc-500 disabled:shadow-none"
      >
        {isRunning && <Spinner className="h-4 w-4" />}
        {isRunning ? "Separating…" : files.length > 1 ? `Separate ${files.length} songs` : "Separate"}
      </motion.button>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {doneJobIds.length >= 1 && (
        <button
          onClick={handleDownloadZip}
          disabled={isZipping}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isZipping && <Spinner className="h-3.5 w-3.5" />}
          {isZipping
            ? "Building ZIP…"
            : `Download all ${doneJobIds.length > 1 ? `${doneJobIds.length} songs' ` : ""}stems as ZIP`}
        </button>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {results.map((result, i) => (
              <motion.div
                key={`${result.fileName}-${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
                className="rounded-xl border border-zinc-700 bg-ink-900 p-4"
              >
                <p className="mb-2 truncate text-sm font-medium text-zinc-200">{result.fileName}</p>

                <ResultStatus status={result.status} error={result.error} processingLabel="Separating…" />

                {result.status === "done" && result.jobId && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-zinc-300">Vocals</p>
                      <audio controls src={downloadUrl(result.jobId, "vocals")} className="w-full" />
                      <DownloadButtons jobId={result.jobId} stem="vocals" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-zinc-300">Instrumental / beat</p>
                      <audio controls src={downloadUrl(result.jobId, "instrumental")} className="w-full" />
                      <DownloadButtons jobId={result.jobId} stem="instrumental" />
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
