import { Spinner } from "./Spinner";

// The queued/processing/error inline states shared by every result card
// across Retune, Separate and Effects — was identical copy-pasted text in
// all three; the "done" layout differs per panel (one stem vs. two) so that
// part stays local to each.
export function ResultStatus({
  status,
  error,
  processingLabel = "Processing…",
}: {
  status: "queued" | "processing" | "error" | "done";
  error?: string | null;
  processingLabel?: string;
}) {
  if (status === "queued") {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner className="h-3.5 w-3.5 opacity-50" />
        Queued…
      </p>
    );
  }
  if (status === "processing") {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-400">
        <Spinner className="h-3.5 w-3.5 text-brand-lime" />
        {processingLabel}
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="flex items-center gap-2 text-sm text-red-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
        {error}
      </p>
    );
  }
  return null;
}
