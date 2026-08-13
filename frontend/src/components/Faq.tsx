import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const ITEMS: { question: string; answer: string }[] = [
  {
    question: "What file types and sizes can I upload?",
    answer:
      "MP3, WAV, M4A, FLAC, OGG, AAC, AIFF and WMA, plus recordings made right here with the mic button. Files need to be under 31 MB. A full song exported as WAV usually isn't, so export as MP3 and you'll be well inside the limit with no audible difference after processing.",
  },
  {
    question: "How long does separation take?",
    answer:
      "Usually a minute or two for a full song. The separation model runs on the server's CPU, and the server sleeps when nobody's using it, so the very first request after a quiet spell also pays for a cold start. Later runs are quicker.",
  },
  {
    question: "Why is the detected BPM or key wrong sometimes?",
    answer:
      "Detection is a best-effort estimate from the audio itself, and it's hardest on solo a cappella vocals where there's no strong beat and little harmonic context. Every detected value is editable before you process, so treat it as a starting point rather than a verdict.",
  },
  {
    question: "Do my uploads stay on the server?",
    answer:
      "No. Files live in a temporary per-job folder and are deleted automatically 45 minutes after the job is created, so download what you want to keep before then.",
  },
  {
    question: "What does 'BPM and key as metadata' actually mean?",
    answer:
      "Every WAV and MP3 you download is tagged with standard ID3 fields: TBPM for tempo, TKEY for key. That's the same metadata Rekordbox, Serato and Traktor read, so your stems land in your library already sorted rather than needing a re-analysis pass.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-ink-900/50">
      {ITEMS.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-white/[0.02] sm:px-5"
            >
              <span className={`text-sm font-medium transition-colors ${isOpen ? "text-brand-lime" : "text-zinc-200"}`}>
                {item.question}
              </span>
              <motion.span
                animate={{ rotate: isOpen ? 45 : 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={`shrink-0 text-lg leading-none transition-colors ${isOpen ? "text-brand-lime" : "text-zinc-500"}`}
                aria-hidden
              >
                +
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-4 pb-4 text-sm leading-relaxed text-zinc-400 sm:px-5">{item.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
