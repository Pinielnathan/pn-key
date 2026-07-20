import { useState } from "react";
import { BackendStatus } from "./components/BackendStatus";
import { RetunePanel } from "./components/RetunePanel";
import { SeparatePanel } from "./components/SeparatePanel";

type Tab = "retune" | "separate";

export default function App() {
  const [tab, setTab] = useState<Tab>("retune");

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3 sm:mb-8 sm:gap-4">
        <img src="/logo.png" alt="PN Key" className="h-11 w-auto shrink-0 sm:h-14" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-zinc-50 sm:text-2xl">PN Key</h1>
          <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
            Retune vocals to a new BPM and key, or split a song into vocal and instrumental stems.
          </p>
        </div>
      </header>

      <BackendStatus />

      <div className="mb-6 flex gap-2 rounded-lg bg-ink-900 p-1">
        <button
          onClick={() => setTab("retune")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "retune" ? "bg-brand-lime text-ink-950" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Retune
        </button>
        <button
          onClick={() => setTab("separate")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "separate" ? "bg-brand-lime text-ink-950" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Separate
        </button>
      </div>

      {tab === "retune" ? <RetunePanel /> : <SeparatePanel />}

      <footer className="mt-12 text-xs text-zinc-600">Only upload audio you have the rights to process.</footer>
    </div>
  );
}
