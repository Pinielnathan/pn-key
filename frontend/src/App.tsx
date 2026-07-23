import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EffectsPanel } from "./components/EffectsPanel";
import { RetunePanel } from "./components/RetunePanel";
import { SeparatePanel } from "./components/SeparatePanel";
import { loadFile, saveFile } from "./lib/fileStore";
import { useLocalStorageState } from "./lib/useLocalStorageState";

type Tab = "retune" | "separate" | "effects";

const TABS: { id: Tab; label: string }[] = [
  { id: "retune", label: "Retune" },
  { id: "separate", label: "Separate" },
  { id: "effects", label: "Effects" },
];

const LAST_RECORDING_KEY = "pnkey:lastRecording";

export default function App() {
  const [tab, setTab] = useLocalStorageState<Tab>("pnkey:tab", "retune");
  const [lastRecording, setLastRecordingState] = useState<File | null>(null);

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

      <div className="relative z-10 mx-auto min-h-screen max-w-2xl px-4 py-6 sm:py-10">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6 flex items-center gap-3 sm:mb-8 sm:gap-4"
        >
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-full bg-brand-lime/20 blur-xl" aria-hidden />
            <img src="/logo.png" alt="PN Key" className="relative h-11 w-auto sm:h-14" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">PN Key</h1>
            <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
              Retune vocals, split songs into stems, or apply voice effects. Every download keeps its BPM
              and key as metadata.
            </p>
          </div>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="relative mb-6 flex gap-1 rounded-xl border border-white/5 bg-ink-900/80 p-1 backdrop-blur"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === id ? "text-ink-950" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab === id && (
                <motion.span
                  layoutId="active-tab"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-lg bg-brand-lime shadow-glow"
                />
              )}
              <span className="relative">{label}</span>
            </button>
          ))}
        </motion.div>

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

        <footer className="mt-12 border-t border-white/5 pt-6 text-xs text-zinc-500">
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
