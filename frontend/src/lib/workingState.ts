/**
 * How long a tool's in-progress work (the files you dropped, the results you
 * produced) is kept across visits.
 *
 * It used to be kept forever, so coming back days later meant finding an old
 * upload and last week's results already sitting there waiting to be cleared by
 * hand. The server deletes a job's audio 45 minutes after it's created, so
 * anything older than that is unusable anyway — its download links are already
 * dead. Matching that window means restored work is work that still functions,
 * and everything else is gone before it can get in the way.
 *
 * Deliberately does not cover settings — target BPM, chosen presets, the tool
 * you were last on. Those are preferences, they cost nothing to keep, and
 * having them remembered is the opposite of an annoyance.
 */
export const WORKING_STATE_TTL_MS = 45 * 60 * 1000;

interface Stamped<T> {
  savedAt: number;
  value: T;
}

export function stamp<T>(value: T): Stamped<T> {
  return { savedAt: Date.now(), value };
}

/**
 * Unwraps a stamped value, returning null if it's expired or unrecognised.
 *
 * Also tolerates the older un-stamped shape that earlier versions wrote, by
 * treating it as expired — a one-time discard of state that predates the
 * timestamp, which is exactly the stale state this is here to remove.
 */
export function unstamp<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || !("savedAt" in raw) || !("value" in raw)) return null;

  const { savedAt, value } = raw as Stamped<T>;
  if (typeof savedAt !== "number" || Date.now() - savedAt > WORKING_STATE_TTL_MS) return null;
  return value;
}
