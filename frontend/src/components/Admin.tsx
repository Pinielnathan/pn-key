import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  adminBulk,
  adminDeleteItem,
  adminDeleteReply,
  adminUpdateItem,
  checkAdminKey,
  fetchAdminOverview,
  type AdminOverview,
  type FeedbackItem,
} from "../lib/api";
import { Spinner } from "./Spinner";

const KEY_STORAGE = "pnkey:adminKey";
const STATUSES = ["open", "planned", "in-progress", "done", "declined"] as const;
type Status = (typeof STATUSES)[number];

/**
 * Stock answers, so replying to a suggestion is a click and an edit rather than
 * writing the same sentence for the fortieth time.
 *
 * Each carries the status that answer implies, because in practice the two are
 * one decision: saying "this is live now" and leaving the entry marked open is
 * just a different kind of unanswered. The text lands in the box editable, and
 * the ones that need a reason end mid-sentence on purpose, so the specific
 * "because" has to be filled in rather than a bare refusal being posted.
 */
const TEMPLATES: { label: string; status: Status; text: string }[] = [
  { label: "Planned", status: "planned", text: "Good idea, this is on the list." },
  { label: "Working on it", status: "in-progress", text: "I'm working on this now." },
  { label: "Shipped", status: "done", text: "This is live now. Thanks for asking for it." },
  { label: "Fixed", status: "done", text: "This should be fixed now. Give it another go and tell me if it still happens." },
  { label: "Need detail", status: "open", text: "Could you add a bit more detail? Specifically: " },
  { label: "Can't reproduce", status: "open", text: "I couldn't reproduce this. Which browser and file type were you using? " },
  { label: "Duplicate", status: "declined", text: "Already tracked in another post, so I'm closing this one to keep the votes together." },
  { label: "Not planned", status: "declined", text: "I'm not planning this for now, because " },
];

const STATUS_STYLES: Record<string, string> = {
  open: "text-zinc-300 bg-white/5",
  planned: "text-sky-300 bg-sky-300/10",
  "in-progress": "text-brand-lime bg-brand-lime/10",
  done: "text-emerald-300 bg-emerald-300/10",
  declined: "text-zinc-500 bg-white/5",
};

interface Draft {
  status?: Status;
  replyText?: string;
}

function timeAgo(seconds: number): string {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-ink-900/60 px-3 py-2.5">
      <p className="text-lg font-bold tabular-nums text-zinc-50">{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}

export function Admin() {
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "feature" | "bug" | "other">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [sort, setSort] = useState<"votes" | "newest" | "replies">("votes");

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

  const dirtyIds = useMemo(
    () =>
      Object.keys(drafts).filter((id) => {
        const d = drafts[id];
        return d && (d.status !== undefined || (d.replyText ?? "").trim().length > 0);
      }),
    [drafts],
  );

  // Leaving with staged edits loses them silently otherwise, which is the one
  // way a Save button can be worse than saving immediately.
  useEffect(() => {
    if (dirtyIds.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds.length]);

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
    setDrafts({});
  }

  function setDraft(id: string, patch: Draft) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function applyTemplate(item: FeedbackItem, template: (typeof TEMPLATES)[number]) {
    setDraft(item.id, { status: template.status, replyText: template.text });
  }

  async function saveAll() {
    if (dirtyIds.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const failures: string[] = [];
    let updated = data?.items ?? [];

    for (const id of dirtyIds) {
      const draft = drafts[id];
      try {
        const result = await adminUpdateItem(key, id, {
          status: draft.status,
          reply_text: draft.replyText?.trim() || undefined,
        });
        updated = updated.map((i) => (i.id === id ? result : i));
      } catch (err) {
        failures.push(err instanceof Error ? err.message : "Unknown error");
      }
    }

    setData((d) => (d ? { ...d, items: updated } : d));
    // Only clear the drafts that actually landed, so a partial failure leaves
    // the unsaved ones still on screen rather than quietly dropping them.
    setDrafts(failures.length === 0 ? {} : drafts);
    setSaving(false);
    if (failures.length > 0) setError(`${failures.length} change(s) failed: ${failures[0]}`);
    else {
      setNotice(`Saved ${dirtyIds.length} change${dirtyIds.length === 1 ? "" : "s"}.`);
      window.setTimeout(() => setNotice(null), 3000);
    }
  }

  async function removeItem(id: string) {
    const previous = data;
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

  async function runBulk(action: "delete" | "status", status?: Status) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await adminBulk(key, action, ids, status);
      setSelected(new Set());
      setConfirmBulk(false);
      await load(key);
      setNotice(action === "delete" ? `Deleted ${ids.length}.` : `Updated ${ids.length}.`);
      window.setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk action failed.");
    } finally {
      setSaving(false);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data?.items ?? [], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pnkey-board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const visible = useMemo(() => {
    let list = [...(data?.items ?? [])];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.text.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q) ||
          (i.replies ?? []).some((r) => r.text.toLowerCase().includes(q)),
      );
    }
    if (kindFilter !== "all") list = list.filter((i) => i.kind === kindFilter);
    if (statusFilter !== "all") list = list.filter((i) => (i.status ?? "open") === statusFilter);
    list.sort((a, b) => {
      if (sort === "newest") return b.created_at - a.created_at;
      if (sort === "replies") return (b.replies?.length ?? 0) - (a.replies?.length ?? 0);
      return b.votes - a.votes || b.created_at - a.created_at;
    });
    return list;
  }, [data, query, kindFilter, statusFilter, sort]);

  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));

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
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Admin</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportJson}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-white/25"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => void load(key)}
            disabled={loading || saving}
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
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Stat label="Entries" value={data.counts.total ?? 0} />
          <Stat label="Open" value={data.counts.open ?? 0} />
          <Stat label="Planned" value={data.counts.planned ?? 0} />
          <Stat label="Done" value={data.counts.done ?? 0} />
          <Stat label="Replies" value={data.counts.replies ?? 0} />
          <Stat label="Jobs" value={data.jobs_in_memory.total ?? 0} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-ink-900/40 p-2.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search text, name or replies"
          className="min-w-[180px] flex-1 rounded-lg border border-zinc-700 bg-ink-900 px-2.5 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-brand-lime"
        />
        <select
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}
          className="rounded-lg border border-zinc-700 bg-ink-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-brand-lime"
        >
          <option value="all">All kinds</option>
          <option value="feature">Feature</option>
          <option value="bug">Bug</option>
          <option value="other">Other</option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="rounded-lg border border-zinc-700 bg-ink-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-brand-lime"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          className="rounded-lg border border-zinc-700 bg-ink-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-brand-lime"
        >
          <option value="votes">Most votes</option>
          <option value="newest">Newest</option>
          <option value="replies">Most replies</option>
        </select>
        <span className="ml-auto text-xs text-zinc-500">
          {visible.length} of {data?.items.length ?? 0}
        </span>
      </div>

      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-zinc-400">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) =>
                setSelected(event.target.checked ? new Set(visible.map((i) => i.id)) : new Set())
              }
              className="h-3.5 w-3.5 accent-brand-lime"
            />
            Select all shown
          </label>
          {selected.size > 0 && (
            <>
              <span className="text-zinc-500">{selected.size} selected</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) void runBulk("status", event.target.value as Status);
                  event.target.value = "";
                }}
                className="rounded-lg border border-zinc-700 bg-ink-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-brand-lime"
              >
                <option value="">Set status to</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {confirmBulk ? (
                <>
                  <button
                    type="button"
                    onClick={() => void runBulk("delete")}
                    className="rounded-lg bg-red-500/90 px-2.5 py-1 font-semibold text-white transition-colors hover:bg-red-500"
                  >
                    Delete {selected.size}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBulk(false)}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmBulk(true)}
                  className="rounded-lg border border-white/10 px-2.5 py-1 text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-400"
                >
                  Delete selected
                </button>
              )}
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
          >
            {error}
          </motion.p>
        )}
        {notice && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-lg border border-brand-lime/30 bg-brand-lime/10 px-3 py-2 text-sm text-brand-lime"
          >
            {notice}
          </motion.p>
        )}
      </AnimatePresence>

      {loading && !data && (
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          <Spinner className="h-3.5 w-3.5" />
          Loading
        </p>
      )}
      {data && visible.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          {data.items.length === 0 ? "Nothing on the board yet." : "Nothing matches those filters."}
        </p>
      )}

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {visible.map((item) => {
            const draft = drafts[item.id] ?? {};
            const status = draft.status ?? ((item.status ?? "open") as Status);
            const isDirty = dirtyIds.includes(item.id);
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={`rounded-xl border bg-ink-900/50 p-4 transition-colors ${
                  isDirty ? "border-brand-lime/40" : "border-white/5"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={(event) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (event.target.checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      })
                    }
                    className="h-3.5 w-3.5 accent-brand-lime"
                  />
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                    {item.kind}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status]}`}>
                    {status}
                  </span>
                  <span className="text-sm font-semibold text-zinc-100">{item.name}</span>
                  <span className="text-xs text-zinc-600">{timeAgo(item.created_at)}</span>
                  <span className="text-xs text-zinc-500">{item.votes} votes</span>
                  {isDirty && <span className="text-[11px] font-medium text-brand-lime">unsaved</span>}

                  <div className="ml-auto flex items-center gap-2">
                    <select
                      value={status}
                      onChange={(event) => setDraft(item.id, { status: event.target.value as Status })}
                      className="rounded-lg border border-zinc-700 bg-ink-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-brand-lime"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
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
                            {reply.official && (
                              <span className="rounded-full bg-brand-lime/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-lime">
                                admin
                              </span>
                            )}
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

                <div className="mt-3 space-y-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATES.map((template) => (
                      <button
                        key={template.label}
                        type="button"
                        onClick={() => applyTemplate(item, template)}
                        title={`${template.text} (sets status to ${template.status})`}
                        className="rounded-lg border border-white/10 px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:border-brand-lime/40 hover:text-brand-lime"
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={draft.replyText ?? ""}
                    onChange={(event) => setDraft(item.id, { replyText: event.target.value })}
                    placeholder="Answer this, or pick one above and edit it"
                    rows={2}
                    className="w-full resize-y rounded-lg border border-zinc-700 bg-ink-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-brand-lime"
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Save bar. Fixed, because the edits it commits are spread down a list
          that can be far longer than the screen. */}
      <AnimatePresence>
        {dirtyIds.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-ink-950/95 backdrop-blur"
          >
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
              <span className="text-sm text-zinc-300">
                <span className="font-semibold text-brand-lime">{dirtyIds.length}</span> unsaved change
                {dirtyIds.length === 1 ? "" : "s"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrafts({})}
                  disabled={saving}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-40"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => void saveAll()}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-brand-lime px-4 py-1.5 text-sm font-semibold text-ink-950 shadow-glow transition-colors hover:bg-brand-limeDark disabled:opacity-60"
                >
                  {saving && <Spinner className="h-3.5 w-3.5" />}
                  {saving ? "Saving" : "Save changes"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
