import { getUserByApiKey, deductCredits, getCredits } from "@/lib/auth";
import { chat, chatStream, DEFAULT_MODEL, OllamaError } from "@/lib/ollama";
import { estimateTokens, computeCost, API_MIN_CENTS } from "@/lib/credits";
import type { OllamaMessage, Role } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OpenAI-compatible chat completions, so OpenAI-API clients (Open WebUI, the
 * OpenAI SDKs, LangChain, etc.) can talk to KodaAI.
 *
 * Point the client at base URL `<origin>/api/v1` with the key `sk-koda-…`.
 * Supports streaming + non-streaming and is metered against prepaid credits.
 */

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

// ── OpenAI message → Ollama message mapping (incl. multimodal content) ──
interface OAIPart {
  type?: string;
  text?: string;
  image_url?: string | { url?: string };
}
interface OAIMessage {
  role?: string;
  content?: string | OAIPart[];
}

function dataUrlToBase64(url: string): string | null {
  if (!url.startsWith("data:")) return null; // only inline images are forwardable
  const comma = url.indexOf(",");
  return comma >= 0 ? url.slice(comma + 1) : null;
}

function mapMessages(messages: OAIMessage[]): OllamaMessage[] {
  const out: OllamaMessage[] = [];
  const images: string[] = [];

  for (const m of messages ?? []) {
    const role: Role =
      m.role === "system" || m.role === "assistant" ? m.role : "user";
    let content = "";
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part?.type === "text" && typeof part.text === "string") content += part.text;
        else if (part?.type === "image_url") {
          const u = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
          const b64 = u ? dataUrlToBase64(u) : null;
          if (b64) images.push(b64);
        }
      }
    }
    out.push({ role, content });
  }

  // Attach any inline images to the most recent user turn (for vision models).
  if (images.length) {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].role === "user") {
        out[i].images = images;
        break;
      }
    }
  }
  return out;
}

interface CompletionsBody {
  model?: string;
  messages?: OAIMessage[];
  stream?: boolean;
  temperature?: number;
}

export async function POST(req: Request) {
  // ── Auth (strict) ──
  const auth = req.headers.get("authorization") || "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!secret) {
    return json({ error: { message: "Missing API key.", type: "invalid_request_error" } }, 401);
  }
  const user = await getUserByApiKey(secret);
  if (!user) {
    return json({ error: { message: "Invalid or revoked API key.", type: "invalid_request_error" } }, 401);
  }

  // ── Credits ──
  const balance = await getCredits(user.id);
  if (balance < API_MIN_CENTS) {
    return json({ error: { message: "Insufficient credits. Top up at /developers.", type: "insufficient_quota" } }, 402);
  }

  // ── Parse ──
  let body: CompletionsBody;
  try {
    body = (await req.json()) as CompletionsBody;
  } catch {
    return json({ error: { message: "Invalid JSON body.", type: "invalid_request_error" } }, 400);
  }

  const model = body.model?.trim() || DEFAULT_MODEL;
  const messages = mapMessages(body.messages ?? []);
  if (!messages.some((m) => m.role === "user")) {
    return json({ error: { message: "`messages` must include a user message.", type: "invalid_request_error" } }, 400);
  }

  const promptTokens = estimateTokens(messages.map((m) => m.content).join("\n"));
  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  const options = typeof body.temperature === "number" ? { temperature: body.temperature } : undefined;

  // ── Bill helper (never lets the balance go negative) ──
  const bill = async (completionTokens: number) => {
    let cost = computeCost(promptTokens, completionTokens);
    let remaining = await deductCredits(user.id, cost);
    if (remaining === null) {
      const left = await getCredits(user.id);
      remaining = (await deductCredits(user.id, left)) ?? 0;
      cost = left;
    }
    return { cost, remaining, completionTokens };
  };

  // ── Streaming (SSE, OpenAI chunk format) ──
  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta, finish_reason: finish }],
        });

        let full = "";
        try {
          send(chunk({ role: "assistant" }));
          for await (const token of chatStream({ model, messages, stream: true, options })) {
            full += token;
            send(chunk({ content: token }));
          }
          send(chunk({}, "stop"));
        } catch (e) {
          const message = e instanceof OllamaError ? e.message : "Upstream model error.";
          send({ error: { message, type: "api_error" } });
        } finally {
          await bill(estimateTokens(full));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        ...CORS,
      },
    });
  }

  // ── Non-streaming ──
  let content: string;
  try {
    content = await chat({ model, messages, options });
  } catch (e) {
    const message = e instanceof OllamaError ? e.message : "Upstream model error.";
    return json({ error: { message, type: "api_error" } }, 502);
  }

  const { cost, remaining, completionTokens } = await bill(estimateTokens(content));
  return json({
    id,
    object: "chat.completion",
    created,
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      // KodaAI extension: credits charged + remaining (US cents).
      credits_charged: cost,
      credits_remaining: remaining,
    },
  });
}
