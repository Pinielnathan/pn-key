import { useEffect } from "react";
import { getJobStatus, pollJobUntilDone } from "./api";
import { useLocalStorageState } from "./useLocalStorageState";

export type ItemStatus = "queued" | "processing" | "done" | "error";

export interface ResultItem {
  fileName: string;
  status: ItemStatus;
  jobId: string | null;
  error: string | null;
}

const EXPIRED_MESSAGE = "This result has expired (job files are only kept for a couple of hours).";

/**
 * Same shape as useState<ResultItem[]>, but persists to localStorage and, once on mount,
 * re-checks every persisted job against the backend — resuming polling for anything still
 * in flight and flagging jobs the server no longer has (past its TTL, or a restart) as expired.
 */
export function useResumableResults(key: string) {
  const [results, setResults] = useLocalStorageState<ResultItem[]>(key, []);

  useEffect(() => {
    results.forEach((result, index) => {
      if (!result.jobId) return;

      if (result.status === "done" || result.status === "error") {
        getJobStatus(result.jobId).catch(() => {
          setResults((prev) => prev.map((r, i) => (i === index ? { ...r, status: "error", error: EXPIRED_MESSAGE } : r)));
        });
        return;
      }

      pollJobUntilDone(result.jobId, () => {})
        .then((finalStatus) => {
          setResults((prev) =>
            prev.map((r, i) =>
              i === index
                ? finalStatus.status === "error"
                  ? { ...r, status: "error", error: finalStatus.error ?? "Processing failed" }
                  : { ...r, status: "done" }
                : r,
            ),
          );
        })
        .catch(() => {
          setResults((prev) => prev.map((r, i) => (i === index ? { ...r, status: "error", error: EXPIRED_MESSAGE } : r)));
        });
    });
    // Only re-verify once, on mount — subsequent status changes flow through each panel's own polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [results, setResults] as const;
}
