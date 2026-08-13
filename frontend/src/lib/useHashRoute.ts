import { useCallback, useEffect, useState } from "react";

export const TOOLS = ["retune", "separate", "effects"] as const;
export type Tool = (typeof TOOLS)[number];

export const PAGES = ["home", "board", "help", "pegasus"] as const;
export type Page = (typeof PAGES)[number];

export interface Route {
  page: Page;
  /** Which tool the home page has selected. Meaningless on other pages. */
  tool: Tool;
}

const STORED_TOOL_KEY = "pnkey:tab";

function parseHash(): Partial<Route> {
  const raw = window.location.hash.replace(/^#\/?/, "").toLowerCase();
  if ((TOOLS as readonly string[]).includes(raw)) return { page: "home", tool: raw as Tool };
  if (raw === "board" || raw === "suggestions") return { page: "board" };
  if (raw === "help" || raw === "faq") return { page: "help" };
  // Deliberately not "admin". Renaming it only makes the page harder to stumble
  // onto, which is worth something against drive-by curiosity but is not what
  // protects it: every write behind this page is gated on the server by
  // ADMIN_TOKEN, and would be just as safe at a guessable URL.
  if (raw === "pegasus") return { page: "pegasus" };
  return {};
}

function storedTool(): Tool {
  try {
    const raw = localStorage.getItem(STORED_TOOL_KEY);
    const parsed = raw !== null ? (JSON.parse(raw) as string) : null;
    if (parsed && (TOOLS as readonly string[]).includes(parsed)) return parsed as Tool;
  } catch {
    // unreadable storage, fall through to the default
  }
  return "retune";
}

/**
 * Hash routing for the whole site, not just the tool tabs.
 *
 * Hash rather than real paths and a router dependency: this deploys as a static
 * SPA, where `/board` would 404 on a hard refresh unless the host is configured
 * to rewrite it. The hash never reaches the server, so every page here is
 * linkable and survives a refresh anywhere it's hosted.
 *
 * The tool doubles as the home page's own URL (`#/separate`), so linking to a
 * specific tool still works and Back moves between tools as well as pages.
 */
export function useHashRoute(): [Route, (next: Partial<Route>) => void] {
  const [route, setRoute] = useState<Route>(() => {
    const parsed = parseHash();
    return { page: parsed.page ?? "home", tool: parsed.tool ?? storedTool() };
  });

  useEffect(() => {
    if (Object.keys(parseHash()).length === 0) {
      window.history.replaceState(null, "", `#/${route.tool}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHash();
      setRoute((prev) => ({
        page: parsed.page ?? prev.page,
        tool: parsed.tool ?? prev.tool,
      }));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORED_TOOL_KEY, JSON.stringify(route.tool));
    } catch {
      // non-fatal: the URL is still the source of truth this session
    }
  }, [route.tool]);

  const navigate = useCallback((next: Partial<Route>) => {
    setRoute((prev) => {
      const merged = { page: next.page ?? prev.page, tool: next.tool ?? prev.tool };
      const hash = merged.page === "home" ? `/${merged.tool}` : `/${merged.page}`;
      // Pushing rather than replacing is what makes Back return to where you were.
      if (window.location.hash !== `#${hash}`) window.location.hash = hash;
      return merged;
    });
  }, []);

  return [route, navigate];
}
