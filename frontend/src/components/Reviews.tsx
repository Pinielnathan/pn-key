import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { fetchReviews, submitReview, type Review } from "../lib/api";
import { Spinner } from "./Spinner";

const MAX_TEXT = 600;

function Stars({
  value,
  onChange,
  size = 16,
}: {
  value: number;
  onChange?: (next: number) => void;
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value;
  const interactive = Boolean(onChange);

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <motion.button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => interactive && setHovered(star)}
          whileHover={interactive ? { scale: 1.2 } : undefined}
          whileTap={interactive ? { scale: 0.9 } : undefined}
          className={interactive ? "cursor-pointer p-0.5" : "p-0.5"}
          aria-label={interactive ? `${star} star${star > 1 ? "s" : ""}` : undefined}
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={star <= shown ? "#d4e01c" : "none"}
            stroke={star <= shown ? "#d4e01c" : "#52525b"}
            strokeWidth="1.6"
            strokeLinejoin="round"
          >
            <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9z" />
          </svg>
        </motion.button>
      ))}
    </div>
  );
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

export function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [average, setAverage] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justPosted, setJustPosted] = useState(false);

  useEffect(() => {
    fetchReviews()
      .then((data) => {
        setReviews(data.reviews);
        setAverage(data.average);
        setCount(data.count);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Couldn't load reviews"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await submitReview({ name, rating, text });
      setReviews((prev) => [created, ...prev]);
      setCount((prev) => prev + 1);
      setAverage((prev) => {
        const total = (prev ?? 0) * count + created.rating;
        return Math.round((total / (count + 1)) * 10) / 10;
      });
      setText("");
      setName("");
      setRating(5);
      setJustPosted(true);
      window.setTimeout(() => setJustPosted(false), 4000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't post that review.");
    } finally {
      setSubmitting(false);
    }
  }

  const remaining = MAX_TEXT - text.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {average !== null && (
          <>
            <Stars value={Math.round(average)} size={18} />
            <span className="text-sm text-zinc-300">
              <span className="font-semibold text-zinc-100">{average}</span> out of 5
            </span>
            <span className="text-sm text-zinc-500">
              · {count} review{count === 1 ? "" : "s"}
            </span>
          </>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-2xl border border-white/5 bg-ink-900/50 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="text-sm text-zinc-300">Your rating</label>
          <Stars value={rating} onChange={setRating} size={22} />
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
          placeholder="How did it go? What did you use it for?"
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
            {submitting ? "Posting…" : "Post review"}
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
              Thanks — your review is up.
            </motion.p>
          )}
        </AnimatePresence>

        <p className="text-xs text-zinc-600">
          Reviews are public. Keep it clean — profanity, sexual content and links are rejected.
        </p>
      </form>

      {loading && (
        <p className="flex items-center justify-center gap-2 text-sm text-zinc-500">
          <Spinner className="h-3.5 w-3.5" />
          Loading reviews…
        </p>
      )}
      {loadError && <p className="text-center text-sm text-zinc-500">{loadError}</p>}
      {!loading && !loadError && reviews.length === 0 && (
        <p className="text-center text-sm text-zinc-500">No reviews yet — be the first.</p>
      )}

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {reviews.map((review, i) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, delay: Math.min(i, 6) * 0.04 }}
              className="rounded-xl border border-white/5 bg-ink-900/50 p-4 transition-colors hover:border-white/10"
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-zinc-100">{review.name}</span>
                <Stars value={review.rating} size={13} />
                <span className="text-xs text-zinc-600">{timeAgo(review.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{review.text}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
