/**
 * Server-side text-to-image generation for the API.
 *
 * The web app generates images with Puter.js (browser-only), which can't run in
 * an API route — so the API uses a server-reachable provider instead. Defaults
 * to Pollinations, which is configurable:
 *
 *   IMAGE_API_BASE      base URL, default https://image.pollinations.ai/prompt
 *   IMAGE_API_MODEL     default model, default "flux"
 *   IMAGE_API_KEY       Pollinations token — strongly recommended; keyless
 *                       access is heavily rate-limited (queue 402s). Free at
 *                       https://auth.pollinations.ai
 *   IMAGE_API_REFERRER  referrer tag for the provider, default "kodaai"
 */

const IMAGE_API_BASE = (
  process.env.IMAGE_API_BASE || "https://image.pollinations.ai/prompt"
).replace(/\/$/, "");
const IMAGE_API_MODEL = process.env.IMAGE_API_MODEL || "flux";
const IMAGE_API_KEY = process.env.IMAGE_API_KEY || "";
const IMAGE_API_REFERRER = process.env.IMAGE_API_REFERRER || "kodaai";

export interface ServerImageOptions {
  width?: number;
  height?: number;
  model?: string;
  seed?: number;
}

/** Build the image URL for the configured provider (token included if set). */
export function imageUrl(prompt: string, opts: ServerImageOptions = {}): string {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const model = opts.model || IMAGE_API_MODEL;
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const qs = new URLSearchParams({
    width: String(width),
    height: String(height),
    model,
    seed: String(seed),
    nologo: "true",
    referrer: IMAGE_API_REFERRER,
  });
  if (IMAGE_API_KEY) qs.set("token", IMAGE_API_KEY);
  return `${IMAGE_API_BASE}/${encodeURIComponent(prompt)}?${qs.toString()}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generate an image and return it base64-encoded (for `b64_json` responses).
 * Retries on the provider's rate-limit/queue responses (402/429/503).
 */
export async function generateImageB64(
  prompt: string,
  opts: ServerImageOptions = {}
): Promise<string> {
  const headers: Record<string, string> = {};
  if (IMAGE_API_KEY) headers["Authorization"] = `Bearer ${IMAGE_API_KEY}`;

  const url = imageUrl(prompt, opts);
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString("base64");
    }
    lastStatus = res.status;
    // Queue full / rate limited / busy → wait and retry.
    if (res.status === 402 || res.status === 429 || res.status === 503) {
      await sleep(2500 * (attempt + 1));
      continue;
    }
    break;
  }

  throw new Error(
    lastStatus === 402 || lastStatus === 429
      ? "Image provider is rate-limited. Set IMAGE_API_KEY (free token at https://auth.pollinations.ai)."
      : `Image provider error (${lastStatus}).`
  );
}
