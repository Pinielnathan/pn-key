import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  adminDeleteItem,
  adminDeleteReply,
  adminSetStatus,
  checkAdminKey,
  fetchAdminOverview,
  type AdminOverview,
  type FeedbackItem,
} from "../lib/api";
import { Spinner } from "./Spinner";

const KEY_STORAGE = "pnkey:adminKey";
const STATUSES = ["open", "planned", "in-progress", "done", "declined"] as const;

function timeAgo(seconds: number): string {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-ink-900/60 px-4 py-3">
      <p className="text-xl font-bold tabular-nums text-zinc-50">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

export function Admin() {
  // Remembering the key is opt-in: on a shared machine, an admin page that
  // silently stays signed in is a liability rather than a convenience.
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async (adminKey: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAdminOverview(adminKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(KEY_STORAGE);
    if (!saved) {
      setChecking(false);
      return;
    }
    checkAdminKey(saved)
      .then((ok) => {
        if (ok) {
          setKey(saved);
          setRemember(true);
          setAuthed(true);
          void load(saved);
        } else {
          localStorage.removeItem(KEY_STORAGE);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [load]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!key.trim()) return;
    setAuthError(null);
    setChecking(true);
    try {
      if (await checkAdminKey(key.trim())) {
        setAuthed(true);
        if (remember) localStorage.setItem(KEY_STORAGE, key.trim());
        void load(key.trim());
      } else {
        setAuthError("That key isn't right.");
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Couldn't reach the server.");
    } finally {
      setChecking(false);
    }
  }

  function signOut() {
    localStorage.removeItem(KEY_STORAGE);
    setKey("");
    setAuthed(false);
    setData(null);
  }

  async function removeItem(id: string) {
    const previous = data;
    // Optimistic, with the previous list kept so a failure can put it back
    // rather than leaving the page claiming something was deleted when it wasn't.
    setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id) } : d));
    setConfirmingId(null);
    try {
      await adminDeleteItem(key, id);
    } catch (err) {
      setData(previous);
      setError(err instanceof Error ? err.message : "Couldn't delete that.");
    }
  }

  async function removeReply(itemId: string, replyId: string) {
    try {
      const updated = await adminDeleteReply(key, itemId, replyId);
      setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === itemId ? updated : i)) } : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that reply.");
    }
  }

  async function changeStatus(item: FeedbackItem, status: string) {
    const previous = data;
    setData((d) =>
      d ? { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, status } : i)) } : d,
    );
    try {
      await adminSetStatus(key, item.id, status);
    } catch (err) {
      setData(previous);
      setError(err instanceof Error ? err.message : "Couldn't update the status.");
    }
  }

  if (checking && !authed) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
        <Spinner className="h-4 w-4" />
        Checking
      </p>
    );
  }

  if (!authed) {
    return (
      <form onSubmit={signIn} className="mx-auto max-w-sm space-y-3 rounded-2xl border border-white/5 bg-ink-900/50 p-5">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Admin</h2>
          <p className="mt-1 text-sm text-zinc-500">Enter your admin key to manage the board.</p>
        </div>
        <input
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="Admin key"
          autoComplete="current-password"
          className="w-full rounded-xl border border-zinc-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-brand-lime focus:ring-2 focus:ring-brand-lime/20"
        />
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-3.5 w-3.5 accent-brand-lime"
          />
          Keep me signed in on this device
        </label>
        {authError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {authError}
          </p>
        )}
        <button
          type="submit"
          disabled={!key.trim() || checking}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-lime px-4 py-2.5 text-sm font-semibold text-ink-950 shadow-glow transition-colors hover:bg-brand-limeDark disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-zinc-500 disabled:shadow-none"
        >
          {checking && <Spinner className="h-3.5 w-3.5" />}
          Sign in
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Admin</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load(key)}
            disabled={loading}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-white/25 disabled:opacity-40"
          >
            {loading ? "Refreshing" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-400"
          >
            Sign out
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Board entries" value={data.counts.total ?? 0} />
          <Stat label="Replies" value={data.counts.replies ?? 0} />
          <Stat label="Jobs in memory" value={data.jobs_in_memory.total ?? 0} />
          <Stat label="Storage" value={data.storage} />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading && !data && (
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          <Spinner className="h-3.5 w-3.5" />
          Loading
        </p>
      )}

      {data && data.items.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">Nothing on the board yet.</p>
      )}

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {data?.items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-xl border border-white/5 bg-ink-900/50 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                  {item.kind}
                </span>
                <span className="text-sm font-semibold text-zinc-100">{item.name}</span>
                <span className="text-xs text-zinc-600">{timeAgo(item.created_at)}</span>
                <span className="text-xs text-zinc-500">{item.votes} votes</span>

                <div className="ml-auto flex items-center gap-2">
                  <select
                    value={item.status ?? "open"}
                    onChange={(event) => void changeStatus(item, event.target.value)}
                    className="rounded-lg border border-zinc-700 bg-ink-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-brand-lime"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>

                  {confirmingId === item.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void removeItem(item.id)}
                        className="rounded-lg bg-red-500/90 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-500"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(item.id)}
                      className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-400"
                    >
                      Take down
                    </button>
                  )}
                </div>
              </div>

              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{item.text}</p>

              {(item.replies?.length ?? 0) > 0 && (
                <div className="mt-3 space-y-2 border-l border-white/10 pl-3">
                  {item.replies?.map((reply) => (
                    <div key={reply.id} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <span className="text-xs font-semibold text-zinc-300">{reply.name}</span>
                          <span className="text-[11px] text-zinc-600">{timeAgo(reply.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-zinc-400">{reply.text}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeReply(item.id, reply.id)}
                        className="shrink-0 rounded px-2 py-0.5 text-[11px] text-zinc-500 transition-colors hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
