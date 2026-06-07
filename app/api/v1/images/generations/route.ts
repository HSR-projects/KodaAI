import { getUserByApiKey, deductCredits, getCredits } from "@/lib/auth";
import { CAPS } from "@/lib/plans";
import { IMAGE_COST_CENTS } from "@/lib/credits";
import { imageUrl, generateImageB64 } from "@/lib/imageServer";

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

interface ImagesBody {
  prompt?: string;
  n?: number;
  size?: string; // "1024x1024"
  model?: string;
  response_format?: "url" | "b64_json";
}

function parseSize(size?: string): { width: number; height: number } {
  const m = /^(\d{2,4})x(\d{2,4})$/.exec((size || "").trim());
  if (!m) return { width: 1024, height: 1024 };
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * OpenAI-compatible image generation (`/v1/images/generations`).
 *
 * Strict: a valid API key, a Pro/Max plan (image generation is a paid feature),
 * AND sufficient credits are required. Metered per image against prepaid credits.
 */
export async function POST(req: Request) {
  // ── Auth ──
  const auth = req.headers.get("authorization") || "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!secret) {
    return json({ error: { message: "Missing API key.", type: "invalid_request_error" } }, 401);
  }
  const user = await getUserByApiKey(secret);
  if (!user) {
    return json({ error: { message: "Invalid or revoked API key.", type: "invalid_request_error" } }, 401);
  }

  // ── Plan gate — image generation is Pro/Max only ──
  if (!CAPS[user.plan].imageGen) {
    return json(
      {
        error: {
          message: "Image generation requires a Pro or Max plan. Upgrade at /developers.",
          type: "insufficient_quota",
        },
      },
      403
    );
  }

  // ── Parse ──
  let body: ImagesBody;
  try {
    body = (await req.json()) as ImagesBody;
  } catch {
    return json({ error: { message: "Invalid JSON body.", type: "invalid_request_error" } }, 400);
  }

  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return json({ error: { message: "`prompt` is required.", type: "invalid_request_error" } }, 400);
  }
  const n = Math.min(Math.max(1, Math.floor(body.n ?? 1)), 4);
  const { width, height } = parseSize(body.size);
  // Default to b64_json: we fetch the image server-side (with token + retry) and
  // return the bytes, so the client never has to load a rate-limited URL itself.
  const format = body.response_format === "url" ? "url" : "b64_json";

  // ── Credits — require the full cost up front ──
  const cost = n * IMAGE_COST_CENTS;
  const balance = await getCredits(user.id);
  if (balance < cost) {
    return json(
      {
        error: {
          message: `Insufficient credits: ${n} image(s) costs ${cost}¢, balance is ${balance}¢. Top up at /developers.`,
          type: "insufficient_quota",
        },
      },
      402
    );
  }

  // ── Generate ──
  const data: Array<{ url?: string; b64_json?: string }> = [];
  try {
    for (let i = 0; i < n; i++) {
      const opts = { width, height, model: body.model };
      if (format === "b64_json") {
        data.push({ b64_json: await generateImageB64(prompt, opts) });
      } else {
        data.push({ url: imageUrl(prompt, opts) });
      }
    }
  } catch (e) {
    return json({ error: { message: (e as Error).message || "Image generation failed.", type: "api_error" } }, 502);
  }

  // ── Bill (never go negative) ──
  let charged = cost;
  let remaining = await deductCredits(user.id, cost);
  if (remaining === null) {
    const left = await getCredits(user.id);
    remaining = (await deductCredits(user.id, left)) ?? 0;
    charged = left;
  }

  return json({
    created: Math.floor(Date.now() / 1000),
    data,
    // KodaAI extension fields.
    credits_charged: charged,
    credits_remaining: remaining,
  });
}
