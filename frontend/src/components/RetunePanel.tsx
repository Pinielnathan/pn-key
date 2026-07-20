import { useState } from "react";
import { analyzeAudio, downloadUrl, pollJobUntilDone, submitRetuneJob } from "../lib/api";
import { NOTE_NAMES, semitoneShiftBetween } from "../lib/keys";
import { FileDrop } from "./FileDrop";

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

export function RetunePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceBpm, setSourceBpm] = useState("");
  const [targetBpm, setTargetBpm] = useState("");
  const [sourceKey, setSourceKey] = useState(0);
  const [targetKey, setTargetKey] = useState(0);
  const [useManualShift, setUseManualShift] = useState(false);
  const [manualShift, setManualShift] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detected, setDetected] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const computedShift = semitoneShiftBetween(sourceKey, targetKey);
  const effectiveShift = useManualShift ? manualShift : computedShift;

  const canSubmit =
    file !== null &&
    Number(sourceBpm) > 0 &&
    Number(targetBpm) > 0 &&
    !isAnalyzing &&
    stage !== "uploading" &&
    stage !== "processing";

  async function handleFileSelected(selected: File) {
    setFile(selected);
    setDetected(false);
    setAnalyzeError(null);
    setIsAnalyzing(true);
    try {
      const result = await analyzeAudio(selected);
      setSourceBpm(String(result.bpm));
      setSourceKey(result.key_index);
      setDetected(true);
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Couldn't auto-detect BPM/key — enter them manually below.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSubmit() {
    if (!file) return;
    setError(null);
    setStage("uploading");
    try {
      const { job_id } = await submitRetuneJob({
        file,
        sourceBpm: Number(sourceBpm),
        targetBpm: Number(targetBpm),
        semitoneShift: effectiveShift,
      });
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
        <h2 className="text-lg font-semibold text-zinc-100">Retune vocals</h2>
        <p className="text-sm text-zinc-400">
          Upload a vocal track — its BPM and key are detected automatically — then pick what you want them
          changed to.
        </p>
      </div>

      <FileDrop label="Vocal audio file" file={file} onFileSelected={handleFileSelected} />

      {isAnalyzing && <p className="text-sm text-zinc-400">Detecting BPM &amp; key…</p>}
      {detected && !isAnalyzing && (
        <p className="text-sm text-brand-lime">
          Detected automatically — adjust the original BPM/key below if it looks off (auto-detection is a
          best effort, especially on a cappella vocals with no strong beat).
        </p>
      )}
      {analyzeError && <p className="text-sm text-amber-400">{analyzeError}</p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <label className="block text-sm">
          <span className="text-zinc-300">Original BPM</span>
          <input
            type="number"
            min={1}
            value={sourceBpm}
            onChange={(event) => setSourceBpm(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-ink-900 px-3 py-2 text-zinc-100 focus:border-brand-lime focus:outline-none"
            placeholder="e.g. 120"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-300">Target BPM</span>
          <input
            type="number"
            min={1}
            value={targetBpm}
            onChange={(event) => setTargetBpm(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-ink-900 px-3 py-2 text-zinc-100 focus:border-brand-lime focus:outline-none"
            placeholder="e.g. 128"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <label className="block text-sm">
          <span className="text-zinc-300">Original key</span>
          <select
            value={sourceKey}
            disabled={useManualShift}
            onChange={(event) => setSourceKey(Number(event.target.value))}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-ink-900 px-3 py-2 text-zinc-100 focus:border-brand-lime focus:outline-none disabled:opacity-50"
          >
            {NOTE_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-zinc-300">Target key</span>
          <select
            value={targetKey}
            disabled={useManualShift}
            onChange={(event) => setTargetKey(Number(event.target.value))}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-ink-900 px-3 py-2 text-zinc-100 focus:border-brand-lime focus:outline-none disabled:opacity-50"
          >
            {NOTE_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={useManualShift}
            onChange={(event) => setUseManualShift(event.target.checked)}
            className="accent-brand-lime"
          />
          Set semitone shift manually instead
        </label>
        {useManualShift ? (
          <input
            type="number"
            min={-24}
            max={24}
            value={manualShift}
            onChange={(event) => setManualShift(Number(event.target.value))}
            className="w-24 rounded-md border border-zinc-700 bg-ink-900 px-2 py-1 text-zinc-100 focus:border-brand-lime focus:outline-none"
          />
        ) : (
          <span className="text-zinc-500">
            Computed shift: {computedShift > 0 ? `+${computedShift}` : computedShift} semitones
          </span>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-md bg-brand-lime px-4 py-2 font-semibold text-ink-950 transition-colors hover:bg-brand-limeDark disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-zinc-500"
      >
        {stage === "uploading" || stage === "processing" ? "Processing…" : "Retune"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {stage === "done" && jobId && (
        <div className="space-y-2 rounded-md border border-zinc-700 bg-ink-900 p-4">
          <p className="text-sm text-brand-lime">Done! Preview and download below.</p>
          <audio controls src={downloadUrl(jobId, "output")} className="w-full" />
          <a
            href={downloadUrl(jobId, "output")}
            download
            className="inline-block rounded-md bg-ink-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-ink-700"
          >
            Download retuned vocal
          </a>
        </div>
      )}
    </div>
  );
}
