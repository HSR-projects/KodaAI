import { getUserByApiKey, deductCredits, getCredits } from "@/lib/auth";
import { chat, DEFAULT_MODEL, OllamaError } from "@/lib/ollama";
import {
  estimateTokens,
  computeCost,
  buildUsage,
  API_MIN_CENTS,
} from "@/lib/credits";
import type { OllamaMessage, Role } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

interface ApiChatBody {
  model?: string;
  /** OpenAI-style messages, or use `prompt` for a single-turn call. */
  messages?: { role?: string; content?: string }[];
  prompt?: string;
  system?: string;
  images?: string[];
}

/**
 * Public, API-key-authenticated chat completion. Strictly gated: a valid key
 * AND a positive credit balance are required. Usage is metered per token and
 * billed against the caller's prepaid credits (see lib/credits.ts) — completely
 * separate from the web subscription.
 */
export async function POST(req: Request) {
  // ── 1. Authenticate the API key (strict) ──
  const auth = req.headers.get("authorization") || "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!secret) {
    return json({ error: "Missing API key. Use 'Authorization: Bearer sk-koda-...'." }, 401);
  }

  const user = await getUserByApiKey(secret);
  if (!user) {
    return json({ error: "Invalid or revoked API key." }, 401);
  }

  // ── 2. Require a usable credit balance up front ──
  const balance = await getCredits(user.id);
  if (balance < API_MIN_CENTS) {
    return json(
      { error: "Insufficient credits. Top up at /developers.", creditsRemaining: balance },
      402
    );
  }

  // ── 3. Parse + validate the request ──
  let body: ApiChatBody;
  try {
    body = (await req.json()) as ApiChatBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const model = body.model?.trim() || DEFAULT_MODEL;
  const messages: OllamaMessage[] = [];
  if (body.system) messages.push({ role: "system", content: body.system });

  if (Array.isArray(body.messages) && body.messages.length) {
    for (const m of body.messages) {
      const role = (m.role === "system" || m.role === "assistant" ? m.role : "user") as Role;
      if (typeof m.content === "string") messages.push({ role, content: m.content });
    }
  } else if (typeof body.prompt === "string" && body.prompt.trim()) {
    messages.push({
      role: "user",
      content: body.prompt,
      ...(body.images?.length ? { images: body.images } : {}),
    });
  }

  if (!messages.some((m) => m.role === "user")) {
    return json({ error: "Provide 'messages' or a 'prompt'." }, 400);
  }

  // ── 4. Run the completion ──
  let content: string;
  try {
    content = await chat({ model, messages });
  } catch (e) {
    const message = e instanceof OllamaError ? e.message : "Upstream model error.";
    const status = e instanceof OllamaError && e.status === 404 ? 400 : 502;
    return json({ error: message }, status);
  }

  // ── 5. Meter + bill ──
  const promptTokens = estimateTokens(messages.map((m) => m.content).join("\n"));
  const completionTokens = estimateTokens(content);
  let cost = computeCost(promptTokens, completionTokens);

  let remaining = await deductCredits(user.id, cost);
  if (remaining === null) {
    // Output cost exceeded the balance — drain what's left (never go negative).
    const left = await getCredits(user.id);
    remaining = (await deductCredits(user.id, left)) ?? 0;
    cost = left;
  }

  return json({
    id: `chatcmpl_${Date.now().toString(36)}`,
    model,
    content,
    usage: buildUsage(promptTokens, completionTokens, cost, remaining),
  });
}
