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
        <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-5">
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

          <button
            type="button"
            onClick={() => selectTool(route.tool)}
            className="ml-auto hidden items-center gap-2 rounded-full bg-brand-lime px-4 py-2 text-sm font-semibold text-ink-950 transition-transform hover:-translate-y-px active:scale-[0.98] sm:inline-flex"
          >
            Open the tools
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
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
                  {/* ── The hero ───────────────────────────────────────────
                      Split, like a studio: the promise on the left, set large,
                      and on the right a console panel that frames the live
                      waveform with the readout every download carries. The
                      three tools are the hero's own buttons, so choosing one is
                      the first thing the page asks rather than something found
                      half a screen down. */}
                  <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-6 sm:pt-12 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
                    <div>
                      <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand-lime/80"
                      >
                        Stems · Retune · Effects
                      </motion.p>
                      <motion.h1
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        className="mt-4 text-balance text-[2.6rem] font-bold leading-[0.98] tracking-[-0.035em] text-zinc-50 sm:text-6xl lg:text-[4.4rem]"
                      >
                        Split any song into stems.{" "}
                        <span className="text-brand-lime">Retune any vocal.</span>
                      </motion.h1>

                      <motion.p
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                        className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-400"
                      >
                        Isolate vocals and instrumentals, shift a take to a new tempo and key, or run it
                        through a studio effect chain. Every download is tagged with its BPM and key.
                      </motion.p>

                      <div className="mt-8 grid gap-3 sm:grid-cols-3">
                        {TABS.map(({ id, label, blurb, icon }, i) => (
                          <motion.button
                            key={id}
                            type="button"
                            onClick={() => selectTool(id)}
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                            whileTap={{ scale: 0.97 }}
                            className={`group relative flex flex-row items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors sm:flex-col sm:items-start sm:p-4 ${
                              route.tool === id
                                ? "border-brand-lime/60 bg-brand-lime/[0.08]"
                                : "border-white/10 bg-ink-900/60 hover:border-white/25"
                            }`}
                          >
                            <span
                              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                                route.tool === id ? "bg-brand-lime text-ink-950" : "bg-white/5 text-zinc-300 group-hover:text-brand-lime"
                              }`}
                            >
                              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                {icon}
                              </svg>
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-zinc-50">{label}</span>
                              <span className="mt-0.5 block text-xs leading-snug text-zinc-400">{blurb}</span>
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.8, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="relative rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-ink-800/80 to-ink-900/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur sm:p-6"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5" aria-hidden>
                          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                        </div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Input</span>
                      </div>

                      <div className="mt-5 rounded-2xl border border-white/5 bg-ink-950/70 px-2 py-4">
                        <LiveWaveform className="cursor-crosshair" height={120} barCount={48} />
                      </div>

                      {/* What a finished download looks like: the readout is an
                          example, labelled as one, of the tags written into
                          every file. */}
                      <div className="mt-4 rounded-2xl border border-white/5 bg-ink-950/50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-mono text-xs text-zinc-300">vocal_take_02.wav</span>
                          <span className="shrink-0 rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">Example</span>
                        </div>
                        <dl className="mt-3 grid grid-cols-3 gap-3">
                          {[
                            { k: "BPM", v: "128" },
                            { k: "Key", v: "A min" },
                            { k: "Shift", v: "+2 st" },
                          ].map(({ k, v }) => (
                            <div key={k} className="flex flex-col-reverse rounded-xl bg-white/[0.03] px-3 py-2.5">
                              <dt className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{k}</dt>
                              <dd className="font-mono text-lg font-semibold text-brand-lime">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    </motion.div>
                  </section>

                  {/* ── The workspace ────────────────────────────────────────
                      The tool itself, wider than before, with the three steps
                      pinned beside it on a monitor so the page explains itself
                      while the form is being filled in. */}
                  <section ref={toolRef} id="tool" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-20 pt-6">
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
                      <div className="min-w-0">
                        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">Workspace</p>
                            <AnimatePresence mode="wait">
                              <motion.h2
                                key={`title-${route.tool}`}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.2 }}
                                className="mt-1 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl"
                              >
                                {activeTab.label}
                                <span className="ml-3 align-middle text-sm font-normal text-zinc-400">{activeTab.blurb}</span>
                              </motion.h2>
                            </AnimatePresence>
                          </div>
                          <div className="flex gap-1 rounded-xl border border-white/10 bg-ink-900/60 p-1">
                            {TABS.map(({ id, label }) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => selectTool(id)}
                                aria-current={route.tool === id ? "page" : undefined}
                                className={`relative rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                  route.tool === id ? "text-ink-950" : "text-zinc-400 hover:text-zinc-200"
                                }`}
                              >
                                {route.tool === id && (
                                  <motion.span
                                    layoutId="active-tab"
                                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                                    className="absolute inset-0 rounded-lg bg-brand-lime"
                                  />
                                )}
                                <span className="relative">{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-[1.5rem] border border-white/10 bg-ink-900/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur sm:p-7">
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
                      </div>

                      <aside className="lg:sticky lg:top-6 lg:self-start">
                        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">How it works</p>
                        <ol className="relative mt-4 space-y-6">
                          <span aria-hidden className="absolute bottom-2 left-[15px] top-2 w-px bg-white/10" />
                          {STEPS.map((step, i) => (
                            <li key={step.title} className="relative flex gap-4">
                              <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-lime/30 bg-ink-950 font-mono text-xs font-bold text-brand-lime">
                                {i + 1}
                              </span>
                              <span className="pt-1">
                                <span className="block text-sm font-semibold text-zinc-100">{step.title}</span>
                                <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{step.body}</span>
                              </span>
                            </li>
                          ))}
                        </ol>
                        <button
                          type="button"
                          onClick={() => navigate({ page: "help" })}
                          className="mt-6 text-xs font-semibold text-zinc-300 underline underline-offset-4 transition-colors hover:text-brand-lime"
                        >
                          Questions, answered →
                        </button>
                      </aside>
                    </div>
                  </section>
                </>
              )}

              {route.page === "board" && (
                <section className="mx-auto max-w-3xl px-4 pb-16 pt-4">
                  <h1 className="text-center text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
                    Ask for a feature, report a bug
                  </h1>
                  <p className="mx-auto mt-2 max-w-lg text-center text-sm text-zinc-400">
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

        <footer className="mx-auto w-full max-w-6xl border-t border-white/5 px-4 py-6 text-xs text-zinc-400">
          <p>
            Only upload audio you have the rights to process. Uploads are deleted from our server within an hour.{" "}
            <a href="https://chitemere.co.zw/privacy" className="text-zinc-400 underline underline-offset-2 transition-colors hover:text-brand-lime">
              Privacy
            </a>{" "}
            ·{" "}
            <a href="https://chitemere.co.zw/terms" className="text-zinc-400 underline underline-offset-2 transition-colors hover:text-brand-lime">
              Terms
            </a>
          </p>
          <p className="mt-3">
            Built by{" "}
            <a
              href="https://chitemere.co.zw"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 underline underline-offset-2 transition-colors hover:text-brand-lime"
            >
              Piniel Chitemere
            </a>
            . Questions, feedback, or want to collaborate?{" "}
            <a
              href="mailto:hello@chitemere.co.zw"
              className="text-zinc-300 underline underline-offset-2 transition-colors hover:text-brand-lime"
            >
              Email me
            </a>{" "}
            or find me on{" "}
            <a
              href="https://instagram.com/piniel_nathan1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 underline underline-offset-2 transition-colors hover:text-brand-lime"
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
