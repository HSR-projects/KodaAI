import type { OllamaMessage, OllamaModel } from "@/types";

/**
 * Ollama Cloud client.
 *
 * KodaAI is configured to use Ollama Cloud (https://ollama.com) rather than a
 * local Ollama daemon. Requests are authenticated with a bearer API key.
 * The wire protocol is identical to local Ollama, so the same client works if
 * you ever point OLLAMA_BASE_URL back at http://localhost:11434.
 */

export const OLLAMA_BASE_URL = (
  process.env.OLLAMA_BASE_URL || "https://ollama.com"
).replace(/\/$/, "");

export const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";

export const DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL || "gpt-oss:120b";

/**
 * Optional hard override. When OLLAMA_FORCE_MODEL is set, EVERY chat call uses
 * this model regardless of what the client selected (Auto, the model picker,
 * or an API request). This is the single choke point — chatStream/chat both
 * funnel through resolveModel — so nothing can route around it.
 */
export const FORCE_MODEL = process.env.OLLAMA_FORCE_MODEL || "";

/**
 * Models that are never offered or used — e.g. ones that log, train on, or
 * otherwise track prompt data. Matched as case-insensitive substrings.
 * Configurable via OLLAMA_BLOCKED_MODELS (comma-separated); falls back to a
 * sane default that excludes known data-retaining preview models.
 */
const DEFAULT_BLOCKED = ["gemini"];
const BLOCK_LIST = (process.env.OLLAMA_BLOCKED_MODELS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const BLOCKED = BLOCK_LIST.length ? BLOCK_LIST : DEFAULT_BLOCKED;

/** True if a model id is on the privacy blocklist. */
export function isBlockedModel(name: string): boolean {
  const n = (name || "").toLowerCase();
  return BLOCKED.some((b) => n.includes(b));
}

export function resolveModel(requested?: string): string {
  const chosen = FORCE_MODEL || requested || DEFAULT_MODEL;
  // Never route a blocked model upstream — fall back to the default.
  if (isBlockedModel(chosen) && !isBlockedModel(DEFAULT_MODEL)) return DEFAULT_MODEL;
  return chosen;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (OLLAMA_API_KEY) headers["Authorization"] = `Bearer ${OLLAMA_API_KEY}`;
  return headers;
}

export class OllamaError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "OllamaError";
    this.status = status;
  }
}

/** Friendly guidance attached to connection failures. */
function connectionHint(): string {
  return "Could not reach the KodaAI model service. Check your connection and try again in a moment.";
}

interface ChatOptions {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  signal?: AbortSignal;
  /** Sampling temperature, etc. */
  options?: Record<string, unknown>;
}

/**
 * Streaming chat. Returns an async generator of content deltas.
 * Ollama streams newline-delimited JSON objects, each with message.content.
 */
export async function* chatStream(
  opts: ChatOptions
): AsyncGenerator<string, void, unknown> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: resolveModel(opts.model),
        messages: opts.messages,
        stream: true,
        options: opts.options,
      }),
      signal: opts.signal,
    });
  } catch {
    throw new OllamaError(connectionHint());
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new OllamaError(
      text || `Ollama request failed (${res.status}). ${connectionHint()}`,
      res.status
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const json = JSON.parse(line);
        const delta: string = json?.message?.content ?? "";
        if (delta) yield delta;
        if (json?.error) throw new OllamaError(String(json.error));
      } catch (e) {
        if (e instanceof OllamaError) throw e;
        // Ignore partial/non-JSON lines.
      }
    }
  }
}

/** Non-streaming chat — returns the full assistant message content. */
export async function chat(opts: ChatOptions): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: resolveModel(opts.model),
        messages: opts.messages,
        stream: false,
        options: opts.options,
      }),
      signal: opts.signal,
    });
  } catch {
    throw new OllamaError(connectionHint());
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OllamaError(
      text || `Ollama request failed (${res.status}). ${connectionHint()}`,
      res.status
    );
  }

  const json = await res.json();
  return json?.message?.content ?? "";
}

/** List models available to this Ollama endpoint. */
export async function listModels(): Promise<OllamaModel[]> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      headers: authHeaders(),
      cache: "no-store",
    });
  } catch {
    throw new OllamaError(connectionHint());
  }

  if (!res.ok) {
    throw new OllamaError(
      `Failed to list models (${res.status}). ${connectionHint()}`,
      res.status
    );
  }

  const json = await res.json();
  const models: OllamaModel[] = Array.isArray(json?.models) ? json.models : [];
  return models;
}
