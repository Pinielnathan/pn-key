import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  fetchFeedback,
  replyToFeedback,
  submitFeedback,
  voteFeedback,
  type FeedbackItem,
  type FeedbackKind,
} from "../lib/api";
import { Spinner } from "./Spinner";

const STATUS_STYLES: Record<string, string> = {
  planned: "text-sky-300 bg-sky-300/10",
  "in-progress": "text-brand-lime bg-brand-lime/10",
  done: "text-emerald-300 bg-emerald-300/10",
  declined: "text-zinc-500 bg-white/5",
};

function ReplyThread({
  item,
  onReplied,
}: {
  item: FeedbackItem;
  onReplied: (updated: FeedbackItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replies = item.replies ?? [];

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      onReplied(await replyToFeedback(item.id, { name, text }));
      setText("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-zinc-500 transition-colors hover:text-brand-lime"
      >
        {replies.length > 0
          ? `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`
          : "Reply"}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 border-l border-white/10 pl-3">
              {replies.map((reply) => (
                <div
                  key={reply.id}
                  className={
                    reply.official
                      ? "rounded-lg border border-brand-lime/20 bg-brand-lime/[0.04] px-2.5 py-2"
                      : undefined
                  }
                >
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span
                      className={`text-xs font-semibold ${reply.official ? "text-brand-lime" : "text-zinc-300"}`}
                    >
                      {reply.name}
                    </span>
                    {reply.official && (
                      <span className="rounded-full bg-brand-lime/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-lime">
                        maintainer
                      </span>
                    )}
                    <span className="text-[11px] text-zinc-600">{timeAgo(reply.created_at)}</span>
                  </div>
                  <p
                    className={`whitespace-pre-wrap text-sm leading-relaxed ${
                      reply.official ? "text-zinc-300" : "text-zinc-400"
                    }`}
                  >
                    {reply.text}
                  </p>
                </div>
              ))}

              <form onSubmit={send} className="space-y-2 pt-1">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name (optional)"
                  maxLength={40}
                  className="w-full rounded-lg border border-zinc-700 bg-ink-900 px-2.5 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-brand-lime"
                />
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT))}
                  placeholder="Add a reply"
                  rows={2}
                  className="w-full resize-y rounded-lg border border-zinc-700 bg-ink-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-brand-lime"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={!text.trim() || busy}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-brand-lime/40 hover:text-brand-lime disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy && <Spinner className="h-3 w-3" />}
                  {busy ? "Posting" : "Post reply"}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const MAX_TEXT = 600;
const VOTED_KEY = "pnkey:votedSuggestions";

const KINDS: { id: FeedbackKind; label: string; hint: string; color: string }[] = [
  { id: "feature", label: "Feature", hint: "Something you'd like added", color: "#d4e01c" },
  { id: "bug", label: "Bug", hint: "Something that's broken", color: "#f87171" },
  { id: "other", label: "Other", hint: "Anything else", color: "#c9a227" },
];

/** Votes are remembered per browser so the button reflects what you've already backed. */
function loadVoted(): Set<string> {
  try {
    const raw = localStorage.getItem(VOTED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveVoted(ids: Set<string>) {
  try {
    localStorage.setItem(VOTED_KEY, JSON.stringify([...ids]));
  } catch {
    // non-fatal: the vote still counted on the server
  }
}

/**
 * Same ordering the server uses: most-wanted first, newest breaking ties.
 *
 * Applied client-side too so the "most wanted first" label stays true between
 * loads. Without it a freshly posted entry sat above items with far more votes
 * until the next refresh, and a vote didn't visibly move anything. The cards
 * are laid out with `layout`, so re-ranking animates the item into its new
 * position rather than teleporting it.
 */
function byRank(a: FeedbackItem, b: FeedbackItem): number {
  return b.votes - a.votes || b.created_at - a.created_at;
}

function timeAgo(seconds: number): string {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

function KindTag({ kind }: { kind: FeedbackKind }) {
  const meta = KINDS.find((k) => k.id === kind) ?? KINDS[2];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color: meta.color, background: `${meta.color}1a` }}
    >
      {meta.label}
    </span>
  );
}

export function Suggestions() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [voted, setVoted] = useState<Set<string>>(() => loadVoted());

  const [name, setName] = useState("");
  const [kind, setKind] = useState<FeedbackKind>("feature");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justPosted, setJustPosted] = useState(false);
  const [filter, setFilter] = useState<FeedbackKind | "all">("all");

  useEffect(() => {
    fetchFeedback()
      .then((data) => setItems(data.items))
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Couldn't load suggestions"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await submitFeedback({ name, kind, text });
      setItems((prev) => [created, ...prev].sort(byRank));
      // Posting counts as backing it, so reflect that in the button straight away.
      setVoted((prev) => {
        const next = new Set(prev).add(created.id);
        saveVoted(next);
        return next;
      });
      setText("");
      setName("");
      setJustPosted(true);
      window.setTimeout(() => setJustPosted(false), 4000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't post that.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote(id: string) {
    if (voted.has(id)) return;
    // Optimistic: the count moves under the cursor, and is reconciled with the
    // server's number when it answers.
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, votes: i.votes + 1 } : i)).sort(byRank));
    setVoted((prev) => {
      const next = new Set(prev).add(id);
      saveVoted(next);
      return next;
    });
    try {
      const updated = await voteFeedback(id);
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)).sort(byRank));
    } catch {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, votes: Math.max(0, i.votes - 1) } : i)).sort(byRank));
      setVoted((prev) => {
        const next = new Set(prev);
        next.delete(id);
        saveVoted(next);
        return next;
      });
    }
  }

  const remaining = MAX_TEXT - text.length;
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-2xl border border-white/5 bg-ink-900/50 p-4 sm:p-5"
      >
        <div className="flex flex-wrap gap-2">
          {KINDS.map((option) => (
            <motion.button
              key={option.id}
              type="button"
              onClick={() => setKind(option.id)}
              whileTap={{ scale: 0.96 }}
              title={option.hint}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                kind === option.id
                  ? "border-transparent text-ink-950"
                  : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"
              }`}
              style={kind === option.id ? { background: option.color } : undefined}
            >
              {option.label}
            </motion.button>
          ))}
        </div>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name (optional)"
          maxLength={40}
          className="w-full rounded-xl border border-zinc-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-brand-lime focus:ring-2 focus:ring-brand-lime/20"
        />

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT))}
          placeholder={
            kind === "bug"
              ? "What went wrong, and what were you doing when it happened?"
              : "What should PN Key do that it doesn't yet?"
          }
          rows={3}
          className="w-full resize-y rounded-xl border border-zinc-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-brand-lime focus:ring-2 focus:ring-brand-lime/20"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`text-xs ${remaining < 60 ? "text-amber-400" : "text-zinc-600"}`}>
            {remaining} characters left
          </span>
          <motion.button
            type="submit"
            disabled={!text.trim() || submitting}
            whileTap={text.trim() && !submitting ? { scale: 0.97 } : undefined}
            className="flex items-center gap-2 rounded-xl bg-brand-lime px-5 py-2.5 text-sm font-semibold text-ink-950 shadow-glow transition-colors hover:bg-brand-limeDark disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-zinc-500 disabled:shadow-none"
          >
            {submitting && <Spinner className="h-3.5 w-3.5" />}
            {submitting ? "Posting…" : "Post it"}
          </motion.button>
        </div>

        <AnimatePresence>
          {formError && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
            >
              {formError}
            </motion.p>
          )}
          {justPosted && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden rounded-lg border border-brand-lime/30 bg-brand-lime/10 px-3 py-2 text-sm text-brand-lime"
            >
              Thanks, that's on the board now.
            </motion.p>
          )}
        </AnimatePresence>

        <p className="text-xs text-zinc-600">
          Posts are public. Keep it clean. Profanity, sexual content and links are rejected.
        </p>
      </form>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "feature", "bug", "other"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === option ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {option === "all" ? `All ${items.length}` : KINDS.find((k) => k.id === option)?.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-zinc-600">Most wanted first</span>
        </div>
      )}

      {loading && (
        <p className="flex items-center justify-center gap-2 text-sm text-zinc-500">
          <Spinner className="h-3.5 w-3.5" />
          Loading the board…
        </p>
      )}
      {loadError && <p className="text-center text-sm text-zinc-500">{loadError}</p>}
      {!loading && !loadError && shown.length === 0 && (
        <p className="text-center text-sm text-zinc-500">
          {items.length === 0 ? "Nothing on the board yet. Be the first to ask for something." : "Nothing of that kind yet."}
        </p>
      )}

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {shown.map((item, i) => {
            const hasVoted = voted.has(item.id);
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i, 6) * 0.04 }}
                className="flex gap-3 rounded-xl border border-white/5 bg-ink-900/50 p-4 transition-colors hover:border-white/10"
              >
                <motion.button
                  type="button"
                  onClick={() => handleVote(item.id)}
                  disabled={hasVoted}
                  whileTap={hasVoted ? undefined : { scale: 0.9 }}
                  whileHover={hasVoted ? undefined : { scale: 1.05 }}
                  aria-label={hasVoted ? "Already backed" : "Back this"}
                  className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border text-sm font-semibold transition-colors ${
                    hasVoted
                      ? "border-brand-lime/40 bg-brand-lime/10 text-brand-lime"
                      : "border-white/10 text-zinc-300 hover:border-brand-lime/40 hover:text-brand-lime"
                  }`}
                >
                  <span className="tabular-nums">{item.votes}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                    {hasVoted ? "backed" : "want"}
                  </span>
                </motion.button>

                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <KindTag kind={item.kind} />
                    {item.status && item.status !== "open" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          STATUS_STYLES[item.status] ?? "text-zinc-400 bg-white/5"
                        }`}
                      >
                        {item.status}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-zinc-100">{item.name}</span>
                    <span className="text-xs text-zinc-600">{timeAgo(item.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{item.text}</p>
                  <ReplyThread
                    item={item}
                    onReplied={(updated) =>
                      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
                    }
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
