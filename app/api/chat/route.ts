import {
  chatStream,
  chat,
  DEFAULT_MODEL,
  OllamaError,
} from "@/lib/ollama";
import {
  SYSTEM_PROMPTS,
  ENGINE_SECRECY,
  ARTIFACT_INSTRUCTIONS,
  COMPUTER_INSTRUCTIONS,
  COMPUTER_UPSELL,
  IMAGE_INSTRUCTIONS,
  IMAGE_UPSELL,
  slidesInstructions,
  SHEETS_INSTRUCTIONS,
  SVG_INSTRUCTIONS,
  WEBSITE_INSTRUCTIONS,
  BRAND_IDENTITY,
  buildSourceContext,
  buildFollowupPrompt,
} from "@/lib/prompts";
import { getCurrentUser, consumeMessage } from "@/lib/auth";
import { CAPS } from "@/lib/plans";
import type {
  ChatRequestBody,
  ChatStreamEvent,
  OllamaMessage,
} from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const currentUser = await getCurrentUser();
  const userPlan = currentUser?.plan ?? "free";

  const {
    query,
    threadHistory = [],
    // Free users are always locked to the default model regardless of what the client sends.
    model: requestedModel = DEFAULT_MODEL,
    focusMode = "all",
    sources = [],
    images = [],
    // Internal calls (title/utility generation) don't count toward usage limits.
    internal = false,
  } = body;

  // ── Free-tier usage limit (rolling window) ──────────────────
  // Real user turns from Free accounts are metered; once exhausted they must
  // upgrade or wait for the window to reset. Internal/utility calls are exempt.
  if (currentUser && userPlan === "free" && !internal) {
    const usage = await consumeMessage(currentUser.id);
    if (!usage.allowed) {
      const hrs = Math.max(1, Math.ceil((usage.resetAt - Date.now()) / 3_600_000));
      const message = `You've used up your free messages for now. Upgrade to Pro or Max for much higher limits — or wait about ${hrs} hour${hrs === 1 ? "" : "s"} for your free quota to reset.`;
      return new Response(
        JSON.stringify({ error: message, limit: true, resetAt: usage.resetAt }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // The "auto" sentinel is resolved client-side; if it ever slips through,
  // fall back to the default model rather than sending a bogus id to Ollama.
  const safeRequested = requestedModel === "auto" ? DEFAULT_MODEL : requestedModel;
  const model = CAPS[userPlan].allModels ? safeRequested : DEFAULT_MODEL;

  if (!query?.trim()) {
    return new Response("Missing query.", { status: 400 });
  }

  // ── Build the message list ──────────────────────────────────
  // Image generation is Pro/Max only — Free users get an upsell notice so the
  // model declines and points them to upgrade instead of emitting a directive.
  const imageBlock = CAPS[userPlan].imageGen ? IMAGE_INSTRUCTIONS : IMAGE_UPSELL;
  const computerBlock = CAPS[userPlan].computer ? COMPUTER_INSTRUCTIONS : COMPUTER_UPSELL;
  const slidesBlock = slidesInstructions(CAPS[userPlan].slidesMax);
  const systemPrompt = `${SYSTEM_PROMPTS[focusMode] ?? SYSTEM_PROMPTS.all}\n\n${ARTIFACT_INSTRUCTIONS}\n\n${computerBlock}\n\n${WEBSITE_INSTRUCTIONS}\n\n${slidesBlock}\n\n${SHEETS_INSTRUCTIONS}\n\n${SVG_INSTRUCTIONS}\n\n${imageBlock}\n\n${ENGINE_SECRECY}\n\n${BRAND_IDENTITY}`;
  const messages: OllamaMessage[] = [{ role: "system", content: systemPrompt }];

  // Prior turns (trimmed to recent history).
  for (const m of threadHistory.slice(-10)) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }

  // Inject retrieved sources for grounded modes.
  const sourceContext =
    focusMode !== "nosearch" && sources.length
      ? buildSourceContext(sources)
      : "";

  messages.push({
    role: "user",
    content: sourceContext ? `${sourceContext}\n\nQuestion: ${query}` : query,
    // Forward base64 images to vision-capable models (ignored by text models).
    ...(Array.isArray(images) && images.length ? { images } : {}),
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullAnswer = "";
      try {
        for await (const delta of chatStream({ model, messages, stream: true })) {
          fullAnswer += delta;
          controller.enqueue(encoder.encode(sse({ type: "token", content: delta })));
        }

        // ── Generate follow-up questions (second, non-streaming call) ──
        let questions: string[] = [];
        try {
          const raw = await chat({
            model,
            messages: [
              {
                role: "user",
                content: buildFollowupPrompt(query, fullAnswer),
              },
            ],
          });
          questions = parseFollowups(raw);
        } catch {
          questions = [];
        }

        if (questions.length) {
          controller.enqueue(
            encoder.encode(sse({ type: "followups", questions }))
          );
        }

        controller.enqueue(encoder.encode(sse({ type: "done" })));
      } catch (e) {
        const message =
          e instanceof OllamaError
            ? e.message
            : "Unexpected error reaching the KodaAI model service.";
        controller.enqueue(encoder.encode(sse({ type: "error", message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Best-effort parse of the model's follow-up output into 3-4 strings. */
function parseFollowups(raw: string): string[] {
  const trimmed = raw.trim();
  // Try to locate a JSON array anywhere in the output.
  const match = trimmed.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) {
        return arr
          .filter((x) => typeof x === "string")
          .map((x: string) => x.trim())
          .filter(Boolean)
          .slice(0, 4);
      }
    } catch {
      /* fall through to line parsing */
    }
  }
  // Fallback: split bullet/numbered lines.
  return trimmed
    .split("\n")
    .map((l) => l.replace(/^[\s\-*\d.)]+/, "").trim())
    .filter((l) => l.length > 4 && l.endsWith("?"))
    .slice(0, 4);
}
