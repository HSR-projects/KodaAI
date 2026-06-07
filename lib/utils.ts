import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stable-ish unique id without external deps. */
export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

/** Auto thread title from the first query (first ~5 words). */
export function titleFromQuery(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, " ");
  const words = trimmed.split(" ").slice(0, 6).join(" ");
  return words.length > 48 ? words.slice(0, 48) + "…" : words || "New thread";
}

/** Relative time like "2 hours ago". */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min > 1 ? "s" : ""} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr > 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day > 1 ? "s" : ""} ago`;
  return new Date(ts).toLocaleDateString();
}

/** Pretty domain from a URL (for source cards). */
export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Google favicon service URL for a given page URL. */
export function faviconUrl(url: string, size = 64): string {
  const domain = domainFromUrl(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    domain
  )}&sz=${size}`;
}

/** Friendly label for a model id (strip namespace + tag noise). */
export function modelLabel(model: string): string {
  if (model === "auto") return "Auto";
  return model.replace(/:latest$/, "");
}
