import type { SearchResult } from "@/types";
import { OLLAMA_BASE_URL, OLLAMA_API_KEY } from "@/lib/ollama";

const SEARXNG_BASE_URL = (
  process.env.SEARXNG_BASE_URL || "http://localhost:8080"
).replace(/\/$/, "");

const BRAVE_KEY = process.env.BRAVE_SEARCH_API_KEY || "";

const isOllamaCloud = /ollama\.com/i.test(OLLAMA_BASE_URL) && !!OLLAMA_API_KEY;

export class SearchUnavailableError extends Error {
  constructor(message = "No search backend is available.") {
    super(message);
    this.name = "SearchUnavailableError";
  }
}

/**
 * Web search. Backend priority:
 *   1. Ollama Cloud Web Search API (reuses OLLAMA_API_KEY — preferred, returns
 *      full page content so no separate scrape is needed)
 *   2. SearXNG (self-hosted, used when running against a local Ollama daemon)
 *   3. Brave Search API (if a key is configured)
 * Throws SearchUnavailableError if none respond, so callers can degrade to
 * "No Search" mode.
 */
export async function searchWeb(
  query: string,
  limit = 5
): Promise<SearchResult[]> {
  const errors: string[] = [];

  if (isOllamaCloud) {
    try {
      const r = await searchOllama(query, limit);
      if (r.length) return r;
    } catch (e) {
      errors.push(`ollama: ${(e as Error).message}`);
    }
  }

  try {
    const r = await searchSearxng(query, limit);
    if (r.length) return r;
  } catch (e) {
    errors.push(`searxng: ${(e as Error).message}`);
  }

  if (BRAVE_KEY) {
    try {
      const r = await searchBrave(query, limit);
      if (r.length) return r;
    } catch (e) {
      errors.push(`brave: ${(e as Error).message}`);
    }
  }

  throw new SearchUnavailableError(
    `No search results. Tried: ${errors.join("; ") || "no backends configured"}`
  );
}

/** Ollama Cloud Web Search API — authenticated with the Ollama API key. */
async function searchOllama(query: string, limit: number): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/web_search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OLLAMA_API_KEY}`,
      },
      body: JSON.stringify({ query, max_results: limit }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    return results.slice(0, limit).map(
      (r: { title?: string; url?: string; content?: string }): SearchResult => {
        const content = (r.content || "").trim();
        return {
          title: r.title || r.url || "Untitled",
          url: r.url || "",
          snippet: content.slice(0, 240),
          content: content.slice(0, 4000),
        };
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function searchSearxng(query: string, limit: number): Promise<SearchResult[]> {
  const url = `${SEARXNG_BASE_URL}/search?q=${encodeURIComponent(
    query
  )}&format=json&safesearch=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    return results.slice(0, limit).map(
      (r: { title?: string; url?: string; content?: string }): SearchResult => ({
        title: r.title || r.url || "Untitled",
        url: r.url || "",
        snippet: r.content || "",
      })
    );
  } finally {
    clearTimeout(timer);
  }
}

async function searchBrave(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
    query
  )}&count=${limit}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": BRAVE_KEY,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const results = json?.web?.results ?? [];
  return results
    .slice(0, limit)
    .map(
      (r: { title?: string; url?: string; description?: string }): SearchResult => ({
        title: r.title || r.url || "Untitled",
        url: r.url || "",
        snippet: r.description || "",
      })
    );
}
