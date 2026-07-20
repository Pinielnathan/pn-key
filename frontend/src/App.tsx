import { useEffect, useState } from "react";
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
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3 sm:mb-8 sm:gap-4">
        <img src="/logo.png" alt="PN Key" className="h-11 w-auto shrink-0 sm:h-14" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-zinc-50 sm:text-2xl">PN Key</h1>
          <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
            Retune vocals, split songs into stems, or apply voice effects. Every download keeps its BPM
            and key as metadata.
          </p>
        </div>
      </header>

      <div className="mb-6 flex gap-2 rounded-lg bg-ink-900 p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === id ? "bg-brand-lime text-ink-950" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "retune" && <RetunePanel lastRecording={lastRecording} onRecorded={setLastRecording} />}
      {tab === "separate" && <SeparatePanel lastRecording={lastRecording} onRecorded={setLastRecording} />}
      {tab === "effects" && <EffectsPanel lastRecording={lastRecording} onRecorded={setLastRecording} />}

      <footer className="mt-12 border-t border-zinc-800 pt-6 text-xs text-zinc-500">
        <p>Only upload audio you have the rights to process.</p>
        <p className="mt-3">
          Built by{" "}
          <a
            href="https://chitemere.co.zw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-brand-lime"
          >
            Piniel Chitemere
          </a>
          . Questions, feedback, or want to collaborate?{" "}
          <a href="mailto:pinielchitemere10@gmail.com" className="text-zinc-400 hover:text-brand-lime">
            Email me
          </a>{" "}
          or find me on{" "}
          <a
            href="https://instagram.com/piniel_nathan1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-brand-lime"
          >
            Instagram
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
