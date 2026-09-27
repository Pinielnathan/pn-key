import { useCallback, useEffect, useRef, useState } from "react";
import { adminLink } from "../lib/api";
import { Spinner } from "./Spinner";

/**
 * "Sign in with Chitemere HQ": a QR code and six digits for the owner's phone.
 *
 * Open Chitemere HQ, scan the code (or type the digits under Settings, Sign in
 * a web console) and approve it. This page notices within a couple of seconds
 * and gets the admin key from the server, so it never has to be found and
 * pasted. Nothing is handed over until the phone approves.
 *
 * A code lasts three minutes and is replaced by itself a few times, then waits
 * for a press, so a forgotten tab does not keep asking all day.
 */

type State =
  | { kind: "loading" }
  | { kind: "ready"; secret: string; code: string; svg: string; expiresAt: number }
  | { kind: "approved" }
  | { kind: "idle" }
  | { kind: "error"; message: string };

const MAX_ROUNDS = 6;

export function PhoneSignIn({ onKey }: { onKey: (key: string) => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const rounds = useRef(0);
  const onKeyRef = useRef(onKey);
  useEffect(() => {
    onKeyRef.current = onKey;
  });

  const renew = useCallback(async () => {
    rounds.current += 1;
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", ...(await adminLink({ action: "start" })) });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Chitemere HQ could not start a sign-in." });
    }
  }, []);

  useEffect(() => {
    void renew();
  }, [renew]);

  // Ask whether the phone has approved it, every two seconds while the page is in view.
  useEffect(() => {
    if (state.kind !== "ready") return;
    let stopped = false;
    let asking = false;
    const next = () => (rounds.current < MAX_ROUNDS ? void renew() : setState({ kind: "idle" }));
    const tick = async () => {
      setNow(Date.now());
      // One question at a time: two in flight could spend the approval on the one that is ignored.
      if (asking || document.visibilityState !== "visible") return;
      if (Date.now() > state.expiresAt) return next();
      asking = true;
      try {
        const out = await adminLink({ action: "claim", secret: state.secret });
        if (stopped) return;
        if (out.state === "approved") {
          stopped = true;
          setState({ kind: "approved" });
          onKeyRef.current(out.key);
        } else if (out.state === "expired") {
          next();
        }
      } catch {
        // A dropped poll is tried again on the next tick.
      } finally {
        asking = false;
      }
    };
    const timer = window.setInterval(() => void tick(), 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [state, renew]);

  const again = () => {
    rounds.current = 0;
    void renew();
  };
  const left = state.kind === "ready" ? Math.max(0, Math.ceil((state.expiresAt - now) / 1000)) : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/60 p-4 text-center" aria-live="polite">
      <p className="text-sm font-semibold text-zinc-100">Sign in with Chitemere HQ</p>
      {state.kind === "ready" ? (
        <>
          <div className="mx-auto mt-4 mb-3 h-48 w-48 rounded-xl bg-white p-2">
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(state.svg)}`}
              alt={`QR code for the sign-in code ${state.code}`}
              className="h-full w-full"
            />
          </div>
          <p className="text-2xl font-bold tracking-[0.3em] tabular-nums text-zinc-50">
            {state.code.slice(0, 3)} {state.code.slice(3)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            Open Chitemere HQ on your phone and scan this, or type the six numbers under Settings, Sign in a web console.
          </p>
          <p className="mt-1.5 text-xs text-zinc-500">
            Waiting for your phone{left ? `, new code in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : ""}.
          </p>
        </>
      ) : state.kind === "loading" || state.kind === "approved" ? (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-400">
          <Spinner className="h-3.5 w-3.5" />
          {state.kind === "loading" ? "Getting a code…" : "Approved on your phone. Opening the board…"}
        </p>
      ) : (
        <>
          <p className={`mt-3 text-sm ${state.kind === "error" ? "text-red-400" : "text-zinc-400"}`}>
            {state.kind === "error" ? state.message : "The code ran out."}
          </p>
          <button
            type="button"
            onClick={again}
            className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-white/30"
          >
            {state.kind === "error" ? "Try again" : "Show a new code"}
          </button>
        </>
      )}
    </div>
  );
}
