const STORAGE_KEY = "pnkey:apiBase";
const BUILD_TIME_DEFAULT = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export function getApiBase(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (stored && stored.trim()) || BUILD_TIME_DEFAULT;
}

export function setApiBase(url: string): void {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function isCustomApiBase(): boolean {
  return Boolean(localStorage.getItem(STORAGE_KEY));
}
