import { useEffect, useState } from "react";
import { checkBackendHealth } from "../lib/api";
import { getApiBase, setApiBase } from "../lib/backendUrl";

type Status = "checking" | "online" | "offline";

export function BackendStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [expanded, setExpanded] = useState(false);
  const [urlInput, setUrlInput] = useState(getApiBase());

  async function check() {
    setStatus("checking");
    const ok = await checkBackendHealth();
    setStatus(ok ? "online" : "offline");
  }

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "offline") setExpanded(true);
  }, [status]);

  function handleSave() {
    setApiBase(urlInput);
    setUrlInput(getApiBase());
    void check();
  }

  return (
    <div className="mb-6 rounded-lg border border-zinc-800 bg-ink-900/60 text-sm">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              status === "online" ? "bg-brand-lime" : status === "offline" ? "bg-red-500" : "bg-zinc-500"
            }`}
          />
          <span className="text-zinc-300">
            {status === "checking" && "Checking backend…"}
            {status === "online" && "Backend online"}
            {status === "offline" && "Backend unreachable"}
          </span>
        </span>
        <span className="text-xs text-zinc-500">{expanded ? "Hide" : "Details"}</span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-zinc-800 px-4 py-3">
          {status === "offline" && (
            <p className="text-zinc-400">
              This backend is self-hosted (runs on the owner's own machine, not a paid cloud service) — it's
              only reachable while that machine and its tunnel are running. If you have a current backend
              URL, paste it below.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              placeholder="https://your-tunnel-url.trycloudflare.com"
              className="flex-1 rounded-md border border-zinc-700 bg-ink-950 px-2 py-1 text-xs text-zinc-100 focus:border-brand-lime focus:outline-none"
            />
            <button
              onClick={handleSave}
              className="rounded-md bg-brand-lime px-3 py-1 text-xs font-semibold text-ink-950 hover:bg-brand-limeDark"
            >
              Save &amp; retest
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
