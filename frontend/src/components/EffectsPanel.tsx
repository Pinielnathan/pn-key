import { useEffect, useState } from "react";
import { downloadUrl, fetchEffectPresets, pollJobUntilDone, submitEffectJob, type EffectPreset } from "../lib/api";
import { FileDrop } from "./FileDrop";

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

export function EffectsPanel() {
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    fetchEffectPresets()
      .then((list) => {
        setPresets(list);
        setSelectedPreset((current) => current ?? list[0]?.slug ?? null);
      })
      .catch((err) => setPresetsError(err instanceof Error ? err.message : "Couldn't load presets"));
  }, []);

  const canSubmit =
    file !== null && selectedPreset !== null && stage !== "uploading" && stage !== "processing";

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
          Upload a vocal, pick a preset, and download the processed result.
        </p>
      </div>

      <FileDrop label="Vocal audio file" file={file} onFileSelected={setFile} />

      {presetsError && <p className="text-sm text-red-400">{presetsError}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {presets.map((preset) => (
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
