import { useCallback, useEffect, useState } from "react";

export const TOOLS = ["retune", "separate", "effects"] as const;
export type Tool = (typeof TOOLS)[number];

const STORED_TOOL_KEY = "pnkey:tab";

function toolFromHash(): Tool | null {
  const raw = window.location.hash.replace(/^#\/?/, "").toLowerCase();
  return (TOOLS as readonly string[]).includes(raw) ? (raw as Tool) : null;
}

function storedTool(): Tool {
  try {
    const raw = localStorage.getItem(STORED_TOOL_KEY);
    const parsed = raw !== null ? (JSON.parse(raw) as string) : null;
    if (parsed && (TOOLS as readonly string[]).includes(parsed)) return parsed as Tool;
  } catch {
    // unreadable storage — fall through to the default
  }
  return "retune";
}

/**
 * Gives each tool its own URL (`#/separate`), so a tool can be linked to and
 * bookmarked, and the back button moves between them.
 *
 * Hash routing rather than a router dependency and real paths: the site is a
 * static SPA on a host that would otherwise need a rewrite rule to stop
 * `/separate` 404ing on a hard refresh. The hash never reaches the server, so
 * this works anywhere it's deployed.
 */
export function useHashRoute(): [Tool, (tool: Tool) => void] {
  const [tool, setToolState] = useState<Tool>(() => toolFromHash() ?? storedTool());

  // Landing without a hash still leaves the address bar showing the tool that's
  // actually on screen, so copying the URL shares what the user is looking at.
  useEffect(() => {
    if (toolFromHash() === null) {
      window.history.replaceState(null, "", `#/${tool}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const next = toolFromHash();
      if (next) setToolState(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORED_TOOL_KEY, JSON.stringify(tool));
    } catch {
      // non-fatal: the URL is still the source of truth this session
    }
  }, [tool]);

  const setTool = useCallback((next: Tool) => {
    setToolState(next);
    // Pushing (not replacing) is what makes Back return to the previous tool.
    if (toolFromHash() !== next) window.location.hash = `/${next}`;
  }, []);

  return [tool, setTool];
}
