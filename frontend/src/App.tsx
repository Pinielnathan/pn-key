import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EffectsPanel } from "./components/EffectsPanel";
import { Faq } from "./components/Faq";
import { LiveWaveform } from "./components/LiveWaveform";
import { Reveal } from "./components/Reveal";
import { RetunePanel } from "./components/RetunePanel";
import { Reviews } from "./components/Reviews";
import { SeparatePanel } from "./components/SeparatePanel";
import { loadFile, saveFile } from "./lib/fileStore";
import { useHashRoute, type Tool } from "./lib/useHashRoute";

type Tab = Tool;

const TABS: { id: Tab; label: string; blurb: string; icon: JSX.Element }[] = [
  {
    id: "retune",
    label: "Retune",
    blurb: "Match a vocal to a new tempo and key",
    icon: (
      <path d="M9 18V5l12-2v13M9 13l12-2M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    ),
  },
  {
    id: "separate",
    label: "Separate",
    blurb: "Split a song into vocals and instrumental",
    icon: <path d="M12 3v18M8 7v10M4 10v4M16 7v10M20 10v4" />,
  },
  {
    id: "effects",
    label: "Effects",
    blurb: "Run a vocal through studio effect chains",
    icon: <path d="M4 6h16M4 12h16M4 18h16M8 4v4M15 10v4M11 16v4" />,
  },
];

const STEPS = [
  { title: "Drop a file", body: "Any common audio format, or record straight from your mic. Nothing to install." },
  { title: "We read the audio", body: "Tempo and key are detected automatically, and stay editable if the estimate looks off." },
  { title: "Download tagged stems", body: "WAV and MP3, each carrying its BPM and key as ID3 metadata your DJ software reads." },
];

const LAST_RECORDING_KEY = "pnkey:lastRecording";

export default function App() {
  const [tab, setTab] = useHashRoute();
  const [lastRecording, setLastRecordingState] = useState<File | null>(null);
  const toolRef = useRef<HTMLElement>(null);

  // Picking a tool should take you to it — otherwise choosing from up in the
  // hero silently swaps a panel that's still below the fold.
  const selectTool = useCallback(
    (next: Tab) => {
      setTab(next);
      toolRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    },
    [setTab],
  );

  useEffect(() => {
    loadFile(LAST_RECORDING_KEY)
      .then((file) => {
        if (file) setLastRecordingState(file);
      })
      .catch(() => {});
  }, []);

  function setLastRecording(file: File) {
    setLastRecordingState(file);
    saveFile(LAST_RECORDING_KEY, file).catch(() => {});
  }

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* Ambient brand glow, drifting slowly behind everything */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-drift absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-brand-lime/10 blur-[120px]" />
        <div
          className="animate-drift absolute -bottom-40 -right-24 h-[460px] w-[460px] rounded-full bg-brand-gold/10 blur-[130px]"
          style={{ animationDelay: "-8s", animationDirection: "reverse" }}
        />
      </div>
      <div className="grain-overlay" aria-hidden />

      <div className="relative z-10">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
          <motion.button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2.5"
            aria-label="Back to top"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-brand-lime/20 blur-lg" aria-hidden />
              <img src="/logo.png" alt="" className="relative h-9 w-auto" />
            </div>
            <span className="text-base font-bold tracking-tight text-zinc-50">PN Key</span>
          </motion.button>
          <motion.button
            type="button"
            onClick={() => selectTool(tab)}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-lg border border-white/10 px-3.5 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-brand-lime/50 hover:text-brand-lime"
          >
            Open the tool
          </motion.button>
        </header>

        {/* ---------- Hero ---------- */}
        <section id="top" className="mx-auto max-w-5xl px-4 pb-4 pt-8 text-center sm:pt-14">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-5xl"
          >
            Split any song into stems.{" "}
            <span className="bg-gradient-to-r from-brand-lime to-brand-gold bg-clip-text text-transparent">
              Retune any vocal.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base"
          >
            Isolate vocals and instrumentals, shift a take to a new tempo and key, or run it through a
            studio effect chain. Every download is tagged with its BPM and key.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8"
          >
            <LiveWaveform className="cursor-crosshair" />
            <p className="mt-2 text-xs text-zinc-600">Move your cursor across the waveform</p>
          </motion.div>

          <motion.button
            type="button"
            onClick={() => selectTool(tab)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.36 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-lime px-6 py-3 font-semibold text-ink-950 shadow-glow transition-colors hover:bg-brand-limeDark"
          >
            Start processing
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </motion.button>
        </section>

        {/* ---------- The tool ---------- */}
        <section ref={toolRef} id="tool" className="mx-auto max-w-2xl scroll-mt-6 px-4 py-12 sm:py-16">
          <div className="mb-5 grid gap-2 sm:grid-cols-3">
            {TABS.map(({ id, label, icon }) => (
              <motion.button
                key={id}
                onClick={() => selectTool(id)}
                aria-current={tab === id ? "page" : undefined}
                whileTap={{ scale: 0.97 }}
                className={`relative flex items-center justify-center gap-2 overflow-hidden rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  tab === id
                    ? "border-brand-lime/60 text-ink-950"
                    : "border-white/8 bg-ink-900/60 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                }`}
              >
                {tab === id && (
                  <motion.span
                    layoutId="active-tab"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    className="absolute inset-0 bg-brand-lime shadow-glow"
                  />
                )}
                <svg
                  className="relative h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {icon}
                </svg>
                <span className="relative">{label}</span>
              </motion.button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.p
              key={`blurb-${tab}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-5 text-center text-xs text-zinc-500"
            >
              {activeTab.blurb}
            </motion.p>
          </AnimatePresence>

          <div className="rounded-2xl border border-white/5 bg-ink-900/40 p-4 backdrop-blur sm:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                {tab === "retune" && <RetunePanel lastRecording={lastRecording} onRecorded={setLastRecording} />}
                {tab === "separate" && <SeparatePanel lastRecording={lastRecording} onRecorded={setLastRecording} />}
                {tab === "effects" && <EffectsPanel lastRecording={lastRecording} onRecorded={setLastRecording} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section className="mx-auto max-w-5xl px-4 py-12">
          <Reveal>
            <h2 className="text-center text-2xl font-bold tracking-tight text-zinc-50">How it works</h2>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.1}>
                <div className="group h-full rounded-2xl border border-white/5 bg-ink-900/50 p-5 transition-colors hover:border-brand-lime/30">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-lime/10 font-mono text-sm font-bold text-brand-lime transition-transform duration-300 group-hover:scale-110">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 font-semibold text-zinc-100">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- Reviews ---------- */}
        <section id="reviews" className="mx-auto max-w-3xl scroll-mt-6 px-4 py-12">
          <Reveal>
            <h2 className="mb-2 text-center text-2xl font-bold tracking-tight text-zinc-50">
              What people are saying
            </h2>
            <p className="mb-6 text-center text-sm text-zinc-500">
              Used it for something? Leave a review — anyone can.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <Reviews />
          </Reveal>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="mx-auto max-w-3xl px-4 py-12">
          <Reveal>
            <h2 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-50">
              Questions, answered
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <Faq />
          </Reveal>
        </section>

        <footer className="mx-auto max-w-3xl border-t border-white/5 px-4 py-8 text-xs text-zinc-500">
          <p>Only upload audio you have the rights to process.</p>
          <p className="mt-3">
            Built by{" "}
            <a
              href="https://chitemere.co.zw"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 transition-colors hover:text-brand-lime"
            >
              Piniel Chitemere
            </a>
            . Questions, feedback, or want to collaborate?{" "}
            <a
              href="mailto:pinielchitemere10@gmail.com"
              className="text-zinc-400 transition-colors hover:text-brand-lime"
            >
              Email me
            </a>{" "}
            or find me on{" "}
            <a
              href="https://instagram.com/piniel_nathan1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 transition-colors hover:text-brand-lime"
            >
              Instagram
            </a>
            .
          </p>
        </footer>
      </div>
    </div>
  );
}
