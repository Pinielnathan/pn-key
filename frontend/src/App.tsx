import { useState } from "react";
import { EffectsPanel } from "./components/EffectsPanel";
import { RetunePanel } from "./components/RetunePanel";
import { SeparatePanel } from "./components/SeparatePanel";

type Tab = "retune" | "separate" | "effects";

const TABS: { id: Tab; label: string }[] = [
  { id: "retune", label: "Retune" },
  { id: "separate", label: "Separate" },
  { id: "effects", label: "Effects" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("retune");

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3 sm:mb-8 sm:gap-4">
        <img src="/logo.png" alt="PN Key" className="h-11 w-auto shrink-0 sm:h-14" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-zinc-50 sm:text-2xl">PN Key</h1>
          <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
            Retune vocals, split songs into stems, or apply voice effects — every download keeps its BPM
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

      {tab === "retune" && <RetunePanel />}
      {tab === "separate" && <SeparatePanel />}
      {tab === "effects" && <EffectsPanel />}

      <footer className="mt-12 text-xs text-zinc-600">Only upload audio you have the rights to process.</footer>
    </div>
  );
}
