import { useEffect, useMemo, useState } from "react";
import {
  downloadUrl,
  fetchEffectPresets,
  pollJobUntilDone,
  submitEffectJob,
  type EffectCategory,
  type EffectPreset,
} from "../lib/api";
import { FileDrop } from "./FileDrop";
import { PresetControls } from "./PresetControls";

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

const PAGE_SIZE = 9;

interface EffectsPresetData {
  preset?: string;
}

export function EffectsPanel() {
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [categories, setCategories] = useState<EffectCategory[]>([]);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    fetchEffectPresets()
      .then(({ presets: list, categories: cats }) => {
        setPresets(list);
        setCategories(cats);
        setSelectedPreset((current) => current ?? list[0]?.slug ?? null);
      })
      .catch((err) => setPresetsError(err instanceof Error ? err.message : "Couldn't load presets"));
  }, []);

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

  const canSubmit =
    file !== null && selectedPreset !== null && stage !== "uploading" && stage !== "processing";

  function getPresetData(): EffectsPresetData {
    return { preset: selectedPreset ?? undefined };
  }

  function loadPresetData(data: EffectsPresetData) {
    if (typeof data.preset === "string" && presets.some((p) => p.slug === data.preset)) {
      setSelectedPreset(data.preset);
    } else {
      setError("That preset file names an effect that isn't available here.");
    }
  }

  async function handleSubmit() {
    if (!file || !selectedPreset) return;
    setError(null);
    setStage("uploading");
    try {
      const { job_id } = await submitEffectJob(file, selectedPreset);
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
        <h2 className="text-lg font-semibold text-zinc-100">Voice effects</h2>
        <p className="text-sm text-zinc-400">
          Upload a vocal, pick from {presets.length || 30} presets, and download the processed result.
        </p>
      </div>

      <FileDrop label="Vocal audio file" file={file} onFileSelected={setFile} />

      {presetsError && <p className="text-sm text-red-400">{presetsError}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
          placeholder="Search presets…"
          className="flex-1 rounded-md border border-zinc-700 bg-ink-900 px-3 py-2 text-sm text-zinc-100 focus:border-brand-lime focus:outline-none"
        />
        <select
          value={category}
          onChange={(event) => updateCategory(event.target.value)}
          className="rounded-md border border-zinc-700 bg-ink-900 px-3 py-2 text-sm text-zinc-100 focus:border-brand-lime focus:outline-none"
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {pagePresets.map((preset) => (
          <button
            key={preset.slug}
            onClick={() => setSelectedPreset(preset.slug)}
            title={preset.description}
            className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
              selectedPreset === preset.slug
                ? "border-brand-lime bg-brand-lime/10 text-brand-lime"
                : "border-zinc-700 bg-ink-900 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            <span className="block font-medium">{preset.name}</span>
            <span className="mt-0.5 block text-xs text-zinc-500 line-clamp-2">{preset.description}</span>
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-zinc-400">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="rounded-md border border-zinc-700 px-2.5 py-1 hover:border-zinc-500 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-md border border-zinc-700 px-2.5 py-1 hover:border-zinc-500 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <PresetControls
        filename="pnkey-effect-preset.json"
        getData={getPresetData}
        onLoad={loadPresetData}
        onError={setError}
      />

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-md bg-brand-lime px-4 py-2 font-semibold text-ink-950 transition-colors hover:bg-brand-limeDark disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-zinc-500"
      >
        {stage === "uploading" || stage === "processing" ? "Applying…" : "Apply effect"}
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
            Download
          </a>
        </div>
      )}
    </div>
  );
}
