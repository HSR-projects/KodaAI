import type { FocusMode } from "@/types";
import { supportsAudio, supportsVision } from "@/lib/modelCapabilities";

/**
 * Sentinel value for the "Auto" model. When a Pro/Max user selects this, the
 * client resolves the best available Ollama Cloud model *per message* based on
 * the task (see {@link pickAutoModel}) instead of pinning one model.
 *
 * It is never sent to the API directly — `useChat` swaps it for a concrete
 * model id before the request leaves the browser.
 */
export const AUTO_MODEL = "auto";

export function isAutoModel(model: string): boolean {
  return model === AUTO_MODEL;
}

type TaskKind = "code" | "reasoning" | "light" | "general";

/**
 * Classify the user's task from the query + focus mode. Kept deliberately
 * heuristic (no extra network round-trip) so model selection adds zero latency.
 */
function classifyTask(query: string, focusMode: FocusMode): TaskKind {
  const q = query.toLowerCase();

  // Coding work — Code focus, or strong code signals in the text.
  if (
    focusMode === "code" ||
    /```|\b(code|coding|function|class|bug|debug|refactor|compile|stack ?trace|regex|api|sdk|typescript|javascript|python|rust|golang|c\+\+|java\b|sql|css|html|npm|yarn|docker|kubernetes)\b/.test(
      q
    ) ||
    /\berror:|exception|traceback|undefined is not|cannot read prop/.test(q)
  )
    return "code";

  // Heavy reasoning — math, proofs, planning, analysis, chess, or long prompts.
  if (
    focusMode === "academic" ||
    query.length > 400 ||
    /\b(prove|theorem|derive|reason|step[- ]by[- ]step|analy[sz]e|math|calculate|equation|algorithm|complexity|optimi[sz]e|strategy|trade-?off|architecture|design a|plan (a|the)|chess|logic puzzle|in depth|rigorous)\b/.test(
      q
    )
  )
    return "reasoning";

  // Quick, cheap turns — short greetings, lookups, definitions, translations.
  if (
    query.length < 90 &&
    /\b(hi|hey|hello|thanks|thank you|ok|what is|who is|when (is|was|did)|where|define|meaning of|translate|tldr|tl;dr|summari[sz]e)\b/.test(
      q
    )
  )
    return "light";

  return "general";
}

/**
 * Per-task model preferences, as ordered regexes matched against the (lowercased)
 * model id. The first available model matching the highest-priority pattern wins.
 * Works with whatever Ollama Cloud exposes — patterns degrade gracefully.
 */
const PREFERENCES: Record<TaskKind, RegExp[]> = {
  // Code-tuned models first, then the strongest generalists.
  code: [/coder/, /code/, /deepseek/, /qwen3/, /qwen/, /glm/, /120b/, /70b/],
  // Deep reasoners / largest models for hard thinking.
  reasoning: [/deepseek/, /\br1\b/, /think|reason/, /671b|480b|405b/, /120b/, /70b/, /qwen3/, /glm/],
  // Smallest/fastest for trivial turns.
  light: [/\b(8|7|3|1)b\b/, /:(?:8|7|3|1)b/, /20b/, /mini|small|flash|fast|lite/],
  // Balanced default — capable but not the heaviest.
  general: [/120b/, /70b/, /deepseek/, /qwen3/, /glm/, /20b/],
};

/** Extract the largest parameter count (in billions) hinted by a model id. */
function paramSize(model: string): number {
  let max = 0;
  for (const m of model.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*b\b/g)) {
    const n = parseFloat(m[1]);
    if (n > max) max = n;
  }
  return max;
}

/**
 * Resolve the {@link AUTO_MODEL} sentinel to a concrete model id given what's
 * available. Returns `fallback` only when nothing is available.
 */
export interface AutoModelHints {
  /** An image was attached — prefer a vision-capable model. */
  needsVision?: boolean;
  /** An audio file was attached — prefer an audio-capable model. */
  needsAudio?: boolean;
}

export function pickAutoModel(
  query: string,
  focusMode: FocusMode,
  available: string[],
  fallback = "",
  hints: AutoModelHints = {}
): string {
  if (!available.length) return fallback;

  // Modality requirements win over task tuning — a vision/audio model is
  // useless for the task if it can't even read the attachment.
  if (hints.needsAudio) {
    const m = available.find((x) => supportsAudio(x));
    if (m) return m;
  }
  if (hints.needsVision) {
    const m = available.find((x) => supportsVision(x));
    if (m) return m;
  }

  const kind = classifyTask(query, focusMode);
  for (const pattern of PREFERENCES[kind]) {
    const match = available.find((m) => pattern.test(m.toLowerCase()));
    if (match) return match;
  }

  // No preference matched. For light tasks bias to the smallest model; for
  // everything else bias to the largest. Falls back to first available.
  const sorted = [...available].sort((a, b) => paramSize(b) - paramSize(a));
  if (kind === "light") return sorted[sorted.length - 1] ?? available[0];
  return sorted[0] ?? available[0];
}
