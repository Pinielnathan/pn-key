import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  downloadUrl,
  fetchEffectPresets,
  pollJobUntilDone,
  previewEffect,
  submitEffectJob,
  type EffectCategory,
  type EffectPreset,
} from "../lib/api";
import { downloadAllAsZip } from "../lib/downloadZip";
import { loadFiles, saveFiles } from "../lib/fileStore";
import { useLocalStorageState } from "../lib/useLocalStorageState";
import { useResumableResults } from "../lib/useResumableResults";
import { DownloadButtons } from "./DownloadButtons";
import { MultiFileDrop } from "./MultiFileDrop";
import { PresetControls } from "./PresetControls";
import { ResultStatus } from "./ResultStatus";
import { Spinner } from "./Spinner";

const PAGE_SIZE = 9;
const FILES_KEY = "pnkey:effects:files";

interface EffectsPresetData {
  presets?: string[];
  /** @deprecated kept for backward compatibility with preset files saved before multi-select */
  preset?: string;
}

interface EffectsPanelProps {
  lastRecording: File | null;
  onRecorded: (file: File) => void;
}

export function EffectsPanel({ lastRecording, onRecorded }: EffectsPanelProps) {
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [categories, setCategories] = useState<EffectCategory[]>([]);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [selectedPresets, setSelectedPresets] = useLocalStorageState<string[]>("pnkey:effects:selectedPresets", []);
  const [search, setSearch] = useLocalStorageState("pnkey:effects:search", "");
  const [category, setCategory] = useLocalStorageState("pnkey:effects:category", "all");
  const [page, setPage] = useLocalStorageState("pnkey:effects:page", 1);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useResumableResults("pnkey:effects:results");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  useEffect(() => {
    fetchEffectPresets()
      .then(({ presets: list, categories: cats }) => {
        setPresets(list);
        setCategories(cats);
        setSelectedPresets((current) => {
          const stillValid = current.filter((slug) => list.some((p) => p.slug === slug));
          return stillValid.length > 0 ? stillValid : list[0] ? [list[0].slug] : [];
        });
      })
      .catch((err) => setPresetsError(err instanceof Error ? err.message : "Couldn't load presets"));
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const filteredPresets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return presets.filter((preset) => {
      const matchesCategory = category === "all" || preset.category === category;
      const matchesQuery =
        query.length === 0 ||
        preset.name.toLowerCase().includes(query) ||
        preset.description.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [presets, search, category]);

  const totalPages = Math.max(1, Math.ceil(filteredPresets.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagePresets = filteredPresets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateCategory(value: string) {
    setCategory(value);
    setPage(1);
  }

  function togglePreset(slug: string) {
    setSelectedPresets((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  async function handlePreview() {
    const sampleFile = files[0];
    if (!sampleFile || selectedPresets.length === 0) return;
    setError(null);
    setIsPreviewing(true);
    try {
      const blob = await previewEffect(sampleFile, selectedPresets);
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

  const canSubmit = files.length > 0 && selectedPresets.length > 0 && !isRunning;

  function getPresetData(): EffectsPresetData {
    return { presets: selectedPresets.length > 0 ? selectedPresets : undefined };
  }

  function loadPresetData(data: EffectsPresetData) {
    const slugs = Array.isArray(data.presets) ? data.presets : typeof data.preset === "string" ? [data.preset] : [];
    const valid = slugs.filter((slug) => presets.some((p) => p.slug === slug));
    if (valid.length > 0 && valid.length === slugs.length) {
      setSelectedPresets(valid);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } else {
      setError("That preset file names an effect that isn't available here.");
    }
  }

  async function runOne(file: File, presetSlugs: string[], index: number) {
    try {
      const { job_id } = await submitEffectJob(file, presetSlugs);
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
    if (files.length === 0 || selectedPresets.length === 0) return;
    setError(null);
    const initial = files.map((file) => ({ fileName: file.name, status: "queued" as const, jobId: null, error: null }));
    setResults(initial);
    setIsRunning(true);
    await Promise.all(files.map((file, index) => runOne(file, selectedPresets, index)));
    setIsRunning(false);
  }

  const doneJobIds = results.filter((r) => r.status === "done" && r.jobId).map((r) => r.jobId as string);

  async function handleDownloadZip() {
    setError(null);
    setIsZipping(true);
    try {
      await downloadAllAsZip(doneJobIds, ["output"], "pnkey-effects.zip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the ZIP.");
    } finally {
      setIsZipping(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Voice effects</h2>
        <p className="text-sm text-zinc-400">
          Upload one or more vocals, pick from {presets.length || 30} presets (combine several to chain
          them), and download the processed result.
        </p>
      </div>

      <MultiFileDrop
        label="Vocal audio file(s)"
        files={files}
        onFilesChange={updateFiles}
        onRecorded={onRecorded}
        lastRecording={lastRecording}
      />

      {presetsError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {presetsError}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
          placeholder="Search presets…"
          className="flex-1 rounded-xl border border-zinc-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-brand-lime focus:ring-2 focus:ring-brand-lime/20"
        />
        <select
          value={category}
          onChange={(event) => updateCategory(event.target.value)}
          className="rounded-xl border border-zinc-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-brand-lime focus:ring-2 focus:ring-brand-lime/20"
        >
          <option value="all">All categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {filteredPresets.length === 0 && presets.length > 0 && (
        <p className="text-sm text-zinc-500">No presets match that search.</p>
      )}

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Click to select. Pick more than one to chain them in order.</span>
        {selectedPresets.length > 0 && (
          <span className="rounded-full bg-brand-lime/10 px-2 py-0.5 font-medium text-brand-lime">
            {selectedPresets.length} selected
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {pagePresets.map((preset) => {
            const selected = selectedPresets.includes(preset.slug);
            return (
              <motion.button
                key={preset.slug}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => togglePreset(preset.slug)}
                title={preset.description}
                className={`relative rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  selected
                    ? "border-brand-lime bg-brand-lime/10 text-brand-lime shadow-glow"
                    : "border-zinc-700 bg-ink-900 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {selected && (
                  <svg
                    className="absolute right-2 top-2 h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                <span className="block pr-4 font-medium">{preset.name}</span>
                <span className="mt-0.5 block text-xs text-zinc-500 line-clamp-2">{preset.description}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-zinc-400">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 transition-colors hover:border-zinc-500 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 transition-colors hover:border-zinc-500 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handlePreview}
          disabled={files.length === 0 || selectedPresets.length === 0 || isPreviewing}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPreviewing && <Spinner className="h-3.5 w-3.5" />}
          {isPreviewing ? "Rendering preview…" : "Preview"}
        </button>
        <span className="text-xs text-zinc-500">
          Quick sample from the first {files.length > 1 ? "file" : "upload"}, not the full render.
        </span>
      </div>
      {previewUrl && <audio controls autoPlay src={previewUrl} className="w-full" />}

      <PresetControls
        filename="pnkey-effect-preset.pnkey"
        kind="effects"
        getData={getPresetData}
        onLoad={loadPresetData}
        onError={setError}
      />

      <motion.button
        onClick={handleSubmit}
        disabled={!canSubmit}
        whileTap={canSubmit ? { scale: 0.98 } : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-lime px-4 py-3 font-semibold text-ink-950 shadow-glow transition-colors hover:bg-brand-limeDark disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-zinc-500 disabled:shadow-none"
      >
        {isRunning && <Spinner className="h-4 w-4" />}
        {isRunning
          ? "Applying…"
          : files.length > 1
            ? `Apply ${selectedPresets.length > 1 ? `${selectedPresets.length} effects` : "effect"} to ${files.length} files`
            : selectedPresets.length > 1
              ? `Apply ${selectedPresets.length} effects`
              : "Apply effect"}
      </motion.button>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {doneJobIds.length >= 2 && (
        <button
          onClick={handleDownloadZip}
          disabled={isZipping}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isZipping && <Spinner className="h-3.5 w-3.5" />}
          {isZipping ? "Building ZIP…" : `Download all ${doneJobIds.length} as ZIP`}
        </button>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
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

                <ResultStatus status={result.status} error={result.error} processingLabel="Applying…" />

                {result.status === "done" && result.jobId && (
                  <div className="space-y-2">
                    <audio controls src={downloadUrl(result.jobId, "output")} className="w-full" />
                    <DownloadButtons jobId={result.jobId} stem="output" />
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
