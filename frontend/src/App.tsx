import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Admin } from "./components/Admin";
import { EffectsPanel } from "./components/EffectsPanel";
import { Faq } from "./components/Faq";
import { LiveWaveform } from "./components/LiveWaveform";
import { Reveal } from "./components/Reveal";
import { RetunePanel } from "./components/RetunePanel";
import { SeparatePanel } from "./components/SeparatePanel";
import { Suggestions } from "./components/Suggestions";
import { loadFile, saveFile } from "./lib/fileStore";
import { useHashRoute, type Page, type Tool } from "./lib/useHashRoute";

const TABS: { id: Tool; label: string; blurb: string; icon: JSX.Element }[] = [
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

const NAV: { page: Page; label: string }[] = [
  { page: "home", label: "Tools" },
  { page: "board", label: "Suggestions" },
  { page: "help", label: "Help" },
];

const LAST_RECORDING_KEY = "pnkey:lastRecording";

export default function App() {
  const [route, navigate] = useHashRoute();
  const [lastRecording, setLastRecordingState] = useState<File | null>(null);
  const toolRef = useRef<HTMLElement>(null);

  useEffect(() => {
    loadFile(LAST_RECORDING_KEY)
      .then((file) => {
        if (file) setLastRecordingState(file);
      })
      .catch(() => {});
  }, []);

  // Every page change starts at the top. Carrying the previous page's scroll
  // position over makes a freshly opened page look like it loaded half way down.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [route.page]);

  function setLastRecording(file: File) {
    setLastRecordingState(file);
    saveFile(LAST_RECORDING_KEY, file).catch(() => {});
  }

  const selectTool = useCallback(
    (next: Tool) => {
      navigate({ page: "home", tool: next });
      // Only scroll when the tool is already on screen. Arriving from another
      // page, the reset above is what should win.
      if (route.page === "home") {
        toolRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start",
        });
      }
    },
    [navigate, route.page],
  );

  const activeTab = TABS.find((t) => t.id === route.tool) ?? TABS[0];

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-drift absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-brand-lime/10 blur-[120px]" />
        <div
          className="animate-drift absolute -bottom-40 -right-24 h-[460px] w-[460px] rounded-full bg-brand-gold/10 blur-[130px]"
          style={{ animationDelay: "-8s", animationDirection: "reverse" }}
        />
      </div>
      <div className="grain-overlay" aria-hidden />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-5">
          <motion.button
            type="button"
            onClick={() => navigate({ page: "home" })}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2.5"
            aria-label="PN Key home"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-brand-lime/20 blur-lg" aria-hidden />
              <img src="/logo.png" alt="" className="relative h-9 w-auto" />
            </div>
            <span className="text-base font-bold tracking-tight text-zinc-50">PN Key</span>
          </motion.button>

          <nav className="flex items-center gap-1">
            {NAV.map(({ page, label }) => (
              <button
                key={page}
                type="button"
                onClick={() => navigate({ page })}
                aria-current={route.page === page ? "page" : undefined}
                className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  route.page === page ? "text-brand-lime" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {route.page === page && (
                  <motion.span
                    layoutId="nav-active"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-brand-lime/10"
                  />
                )}
                <span className="relative">{label}</span>
              </button>
            ))}
          </nav>
        </header>

        <main className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={route.page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {route.page === "home" && (
                <>
                  <section className="mx-auto max-w-5xl px-4 pb-4 pt-6 text-center sm:pt-12">
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
                      Isolate vocals and instrumentals, shift a take to a new tempo and key, or run it
                      through a studio effect chain. Every download is tagged with its BPM and key.
                    </motion.p>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.8, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="mt-7"
                    >
                      <LiveWaveform className="cursor-crosshair" height={72} />
                    </motion.div>
                  </section>

                  <section ref={toolRef} id="tool" className="mx-auto max-w-2xl scroll-mt-6 px-4 pb-16 pt-4">
                    <div className="mb-5 grid gap-2 sm:grid-cols-3">
                      {TABS.map(({ id, label, icon }) => (
                        <motion.button
                          key={id}
                          onClick={() => selectTool(id)}
                          aria-current={route.tool === id ? "page" : undefined}
                          whileTap={{ scale: 0.97 }}
                          className={`relative flex items-center justify-center gap-2 overflow-hidden rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                            route.tool === id
                              ? "border-brand-lime/60 text-ink-950"
                              : "border-white/8 bg-ink-900/60 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                          }`}
                        >
                          {route.tool === id && (
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
                        key={`blurb-${route.tool}`}
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
                          key={route.tool}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {route.tool === "retune" && (
                            <RetunePanel lastRecording={lastRecording} onRecorded={setLastRecording} />
                          )}
                          {route.tool === "separate" && (
                            <SeparatePanel lastRecording={lastRecording} onRecorded={setLastRecording} />
                          )}
                          {route.tool === "effects" && (
                            <EffectsPanel lastRecording={lastRecording} onRecorded={setLastRecording} />
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </section>
                </>
              )}

              {route.page === "board" && (
                <section className="mx-auto max-w-3xl px-4 pb-16 pt-4">
                  <h1 className="text-center text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
                    Ask for a feature, report a bug
                  </h1>
                  <p className="mx-auto mt-2 max-w-lg text-center text-sm text-zinc-500">
                    Anyone can post, reply, and back what's already there. The most wanted rise to the top.
                  </p>
                  <div className="mt-8">
                    <Suggestions />
                  </div>
                </section>
              )}

              {route.page === "help" && (
                <section className="mx-auto max-w-3xl px-4 pb-16 pt-4">
                  <h1 className="text-center text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
                    How it works
                  </h1>
                  <div className="mt-8 grid gap-4 sm:grid-cols-3">
                    {STEPS.map((step, i) => (
                      <Reveal key={step.title} delay={i * 0.08}>
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

                  <h2 className="mb-6 mt-14 text-center text-2xl font-bold tracking-tight text-zinc-50">
                    Questions, answered
                  </h2>
                  <Faq />
                </section>
              )}

              {route.page === "pegasus" && (
                <section className="mx-auto max-w-3xl px-4 pb-16 pt-4">
                  <Admin />
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="mx-auto w-full max-w-5xl border-t border-white/5 px-4 py-6 text-xs text-zinc-500">
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
