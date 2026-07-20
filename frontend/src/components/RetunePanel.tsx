import { useEffect, useRef, useState } from "react";
import {
  analyzeAudio,
  downloadUrl,
  pollJobUntilDone,
  previewRetune,
  submitRetuneJob,
  type AnalyzeResult,
} from "../lib/api";
import { NOTE_NAMES, semitoneShiftBetween } from "../lib/keys";
import { MultiFileDrop } from "./MultiFileDrop";
import { PresetControls } from "./PresetControls";

type ItemStatus = "queued" | "processing" | "done" | "error";

interface RetunePresetData {
  targetBpm?: number;
  targetKeyIndex?: number;
  useManualShift?: boolean;
  manualShift?: number;
}

interface ResultItem {
  file: File;
  status: ItemStatus;
  jobId: string | null;
  error: string | null;
}

type Analysis = AnalyzeResult | "error";

interface RetunePanelProps {
  lastRecording: File | null;
  onRecorded: (file: File) => void;
}

export function RetunePanel({ lastRecording, onRecorded }: RetunePanelProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [analysisByFile, setAnalysisByFile] = useState<Map<File, Analysis>>(new Map());
  const inFlightRef = useRef<Set<File>>(new Set());

  const [sourceBpmOverride, setSourceBpmOverride] = useState<string | null>(null);
  const [sourceKeyOverride, setSourceKeyOverride] = useState<number | null>(null);

  const [targetBpm, setTargetBpm] = useState("");
  const [targetKey, setTargetKey] = useState(0);
  const [useManualShift, setUseManualShift] = useState(false);
  const [manualShift, setManualShift] = useState(0);

  const [results, setResults] = useState<ResultItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const singleFile = files.length === 1 ? files[0] : null;
  const singleAnalysis = singleFile ? analysisByFile.get(singleFile) : undefined;
  const isAnalyzingSingle = singleFile !== null && singleAnalysis === undefined;
  const singleAnalysisFailed = singleAnalysis === "error";

  const displaySourceBpm =
    sourceBpmOverride ?? (singleAnalysis && singleAnalysis !== "error" ? String(singleAnalysis.bpm) : "");
  const displaySourceKey =
    sourceKeyOverride ?? (singleAnalysis && singleAnalysis !== "error" ? singleAnalysis.key_index : 0);

  const computedShift = semitoneShiftBetween(displaySourceKey, targetKey);

  const pendingAnalysisCount = files.filter((f) => !analysisByFile.has(f)).length;
  const failedAnalysisCount = files.filter((f) => analysisByFile.get(f) === "error").length;

  function handleFilesChange(newFiles: File[]) {
    setFiles(newFiles);
    setError(null);

    if (newFiles.length === 1 && newFiles[0] !== singleFile) {
      setSourceBpmOverride(null);
      setSourceKeyOverride(null);
    }

    const toAnalyze = newFiles.filter((f) => !analysisByFile.has(f) && !inFlightRef.current.has(f));
    toAnalyze.forEach((f) => {
      inFlightRef.current.add(f);
      analyzeAudio(f)
        .then((result) => setAnalysisByFile((prev) => new Map(prev).set(f, result)))
        .catch(() => setAnalysisByFile((prev) => new Map(prev).set(f, "error")))
        .finally(() => inFlightRef.current.delete(f));
    });
  }

  function effectiveSourceFor(file: File): { bpm: number; keyIndex: number } | null {
    if (singleFile && file === singleFile) {
      const bpm = sourceBpmOverride !== null ? Number(sourceBpmOverride) : null;
      const keyIndex = sourceKeyOverride !== null ? sourceKeyOverride : null;
      if (bpm !== null && bpm > 0 && keyIndex !== null) return { bpm, keyIndex };
      const analysis = analysisByFile.get(file);
      if (!analysis || analysis === "error") return null;
      return {
        bpm: bpm !== null && bpm > 0 ? bpm : analysis.bpm,
        keyIndex: keyIndex !== null ? keyIndex : analysis.key_index,
      };
    }
    const analysis = analysisByFile.get(file);
    if (!analysis || analysis === "error") return null;
    return { bpm: analysis.bpm, keyIndex: analysis.key_index };
  }

  const previewFile = files[0] ?? null;
  const previewSource = previewFile ? effectiveSourceFor(previewFile) : null;
  const canPreview = previewFile !== null && previewSource !== null && Number(targetBpm) > 0 && !isPreviewing;

  async function handlePreview() {
    if (!previewFile || !previewSource) return;
    setError(null);
    setIsPreviewing(true);
    try {
      const shift = useManualShift ? manualShift : semitoneShiftBetween(previewSource.keyIndex, targetKey);
      const blob = await previewRetune({
        file: previewFile,
        sourceBpm: previewSource.bpm,
        targetBpm: Number(targetBpm),
        semitoneShift: shift,
      });
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a preview.");
    } finally {
      setIsPreviewing(false);
    }
  }

  const canSubmit =
    files.length > 0 && Number(targetBpm) > 0 && !isRunning && (files.length > 1 || !isAnalyzingSingle);

  function getPresetData(): RetunePresetData {
    return {
      targetBpm: Number(targetBpm) || undefined,
      targetKeyIndex: targetKey,
      useManualShift,
      manualShift,
    };
  }

  function loadPresetData(data: RetunePresetData) {
    setError(null);
    if (typeof data.targetBpm === "number" && data.targetBpm > 0) {
      setTargetBpm(String(data.targetBpm));
    }
    if (
      typeof data.targetKeyIndex === "number" &&
      Number.isInteger(data.targetKeyIndex) &&
      data.targetKeyIndex >= 0 &&
      data.targetKeyIndex < 12
    ) {
      setTargetKey(data.targetKeyIndex);
    }
    if (typeof data.useManualShift === "boolean") {
      setUseManualShift(data.useManualShift);
    }
    if (typeof data.manualShift === "number" && data.manualShift >= -24 && data.manualShift <= 24) {
      setManualShift(data.manualShift);
    }
  }

  async function runOne(file: File, index: number) {
    const source = effectiveSourceFor(file);
    if (!source) {
      setResults((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, status: "error", error: "Couldn't detect BPM/key for this file." } : r,
        ),
      );
      return;
    }
    const shift = useManualShift ? manualShift : semitoneShiftBetween(source.keyIndex, targetKey);
    try {
      const { job_id } = await submitRetuneJob({
        file,
        sourceBpm: source.bpm,
        targetBpm: Number(targetBpm),
        semitoneShift: shift,
      });
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
    setError(null);
    const initial: ResultItem[] = files.map((file) => ({ file, status: "queued", jobId: null, error: null }));
    setResults(initial);
    setIsRunning(true);
    await Promise.all(files.map((file, index) => runOne(file, index)));
    setIsRunning(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Retune vocals</h2>
        <p className="text-sm text-zinc-400">
          Upload one or more vocal tracks. BPM and key are detected automatically, then pick what you want
          them changed to.
        </p>
      </div>

      <MultiFileDrop
        label="Vocal audio file(s)"
        files={files}
        onFilesChange={handleFilesChange}
        onRecorded={onRecorded}
        lastRecording={lastRecording}
      />

      {files.length === 1 && isAnalyzingSingle && <p className="text-sm text-zinc-400">Detecting BPM &amp; key…</p>}
      {files.length === 1 && !isAnalyzingSingle && !singleAnalysisFailed && singleAnalysis && (
        <p className="text-sm text-brand-lime">
          Detected automatically. Adjust the original BPM/key below if it looks off (auto-detection is a
          best effort, especially on a cappella vocals with no strong beat).
        </p>
      )}
      {files.length === 1 && singleAnalysisFailed && (
        <p className="text-sm text-amber-400">Couldn't auto-detect BPM/key. Enter them manually below.</p>
      )}
      {files.length > 1 && pendingAnalysisCount > 0 && (
        <p className="text-sm text-zinc-400">Detecting BPM &amp; key for {pendingAnalysisCount} file(s)…</p>
      )}
      {files.length > 1 && pendingAnalysisCount === 0 && failedAnalysisCount > 0 && (
        <p className="text-sm text-amber-400">
          Couldn't detect BPM/key for {failedAnalysisCount} file(s); those will be skipped.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <label className="block text-sm">
          <span className="text-zinc-300">{files.length > 1 ? "Original BPM (per file, auto)" : "Original BPM"}</span>
          <input
            type="number"
            min={1}
            value={displaySourceBpm}
            disabled={files.length > 1}
            onChange={(event) => setSourceBpmOverride(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-ink-900 px-3 py-2 text-zinc-100 focus:border-brand-lime focus:outline-none disabled:opacity-50"
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
          <span className="text-zinc-300">{files.length > 1 ? "Original key (per file, auto)" : "Original key"}</span>
          <select
            value={displaySourceKey}
            disabled={useManualShift || files.length > 1}
            onChange={(event) => setSourceKeyOverride(Number(event.target.value))}
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
            {files.length > 1 ? "Computed per file from" : "Computed shift:"}{" "}
            {files.length <= 1 && (computedShift > 0 ? `+${computedShift}` : computedShift)}
            {files.length > 1 && `target key (${NOTE_NAMES[targetKey]})`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePreview}
          disabled={!canPreview}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPreviewing ? "Rendering preview…" : "Preview"}
        </button>
        <span className="text-xs text-zinc-500">
          Quick sample from the first {files.length > 1 ? "file" : "upload"}, not the full render.
        </span>
      </div>
      {previewUrl && <audio controls autoPlay src={previewUrl} className="w-full" />}

      <PresetControls
        filename="pnkey-retune-preset.json"
        getData={getPresetData}
        onLoad={loadPresetData}
        onError={setError}
      />

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-md bg-brand-lime px-4 py-2 font-semibold text-ink-950 transition-colors hover:bg-brand-limeDark disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-zinc-500"
      >
        {isRunning ? "Processing…" : files.length > 1 ? `Retune ${files.length} files` : "Retune"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result, i) => (
            <div key={`${result.file.name}-${i}`} className="rounded-md border border-zinc-700 bg-ink-900 p-4">
              <p className="mb-2 truncate text-sm font-medium text-zinc-200">{result.file.name}</p>

              {result.status === "queued" && <p className="text-sm text-zinc-500">Queued…</p>}
              {result.status === "processing" && <p className="text-sm text-zinc-400">Processing…</p>}
              {result.status === "error" && <p className="text-sm text-red-400">{result.error}</p>}

              {result.status === "done" && result.jobId && (
                <div className="space-y-2">
                  <audio controls src={downloadUrl(result.jobId, "output")} className="w-full" />
                  <div className="flex gap-2">
                    <a
                      href={downloadUrl(result.jobId, "output", "wav")}
                      download
                      className="inline-block rounded-md bg-ink-800 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-ink-700"
                    >
                      WAV
                    </a>
                    <a
                      href={downloadUrl(result.jobId, "output", "mp3")}
                      download
                      className="inline-block rounded-md bg-ink-800 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-ink-700"
                    >
                      MP3
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
