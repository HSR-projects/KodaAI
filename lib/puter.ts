/**
 * Text-to-image generation via Puter.js (https://puter.com).
 *
 * Puter is a free, serverless, "user-pays" AI SDK — there are no API keys to
 * manage; the script is loaded lazily in the browser the first time an image is
 * requested, and Puter handles auth/billing with the end user directly.
 *
 * Exposes `generateImage(prompt)` → a usable image URL (usually a data: URL).
 */

interface PuterAI {
  // Signature has shifted across Puter versions (and now requires a model), so
  // keep it variadic and pass the right shape at the call site.
  txt2img: (prompt: string, ...args: unknown[]) => Promise<HTMLImageElement | string>;
  /** Image-to-image, when the SDK build exposes it. */
  img2img?: (...args: unknown[]) => Promise<HTMLImageElement | string>;
}
interface Puter {
  ai: PuterAI;
}
declare global {
  interface Window {
    puter?: Puter;
  }
}

const PUTER_SRC = "https://js.puter.com/v2/";

/** Preferred text-to-image model; override with NEXT_PUBLIC_PUTER_IMAGE_MODEL. */
const IMAGE_MODEL = process.env.NEXT_PUBLIC_PUTER_IMAGE_MODEL || "gpt-image-1";

/** Models to try in order — newer Puter retired some, so fall back across them. */
const MODEL_CANDIDATES = Array.from(
  new Set([IMAGE_MODEL, "gpt-image-1", "dall-e-3", "dall-e-2"])
);
let loadPromise: Promise<void> | null = null;

/** Inject the Puter.js script once and resolve when `window.puter` is ready. */
function loadPuter(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Image generation only runs in the browser."));
  }
  if (window.puter) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PUTER_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load the image generator.")));
      if (window.puter) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = PUTER_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load the image generator."));
    document.head.appendChild(script);
  });
  return loadPromise;
}

function toUrl(result: HTMLImageElement | string): string | null {
  if (typeof result === "string") return result || null;
  if (result && typeof result.src === "string") return result.src || null;
  return null;
}

function errText(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return (e as { message?: string }).message ?? JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Is this error about the model arg (so it's safe to try another shape/model)? */
function isModelError(e: unknown): boolean {
  return /missing.*model|model.*(missing|required|invalid|not found|unknown)/i.test(
    errText(e)
  );
}

/**
 * Generate an image from a text prompt; resolves to an image URL.
 *
 * Puter's `txt2img` requires a `model` in recent versions, but both the
 * argument shape AND the valid model ids have changed over time. We try the
 * documented `(prompt, testMode, options)` shape and a single-object shape
 * across the known models, only advancing when the failure was specifically
 * about the model — so a real error (auth/network) surfaces immediately and we
 * never trigger duplicate billable generations.
 */
export async function generateImage(prompt: string): Promise<string> {
  await loadPuter();
  const ai = window.puter?.ai;
  if (!ai?.txt2img) throw new Error("Image generator is unavailable.");

  let lastErr: unknown;
  for (const model of MODEL_CANDIDATES) {
    const shapes: Array<() => Promise<HTMLImageElement | string>> = [
      () => ai.txt2img({ prompt, model } as unknown as string), // single-object (current)
      () => ai.txt2img(prompt, false, { model }), // positional (prompt, testMode, options)
    ];
    for (const run of shapes) {
      try {
        const url = toUrl(await run());
        if (url) return url;
      } catch (e) {
        lastErr = e;
        // Non-model error (auth, network, content policy) → surface it now.
        if (!isModelError(e)) throw new Error(errText(e) || "Image generation failed.");
      }
    }
  }
  throw new Error(
    `${errText(lastErr) || "No image was returned."} (tried models: ${MODEL_CANDIDATES.join(", ")})`
  );
}

/**
 * Image-to-image: generate a new image from a text prompt **and** a source image
 * (a data: or http URL). Uses Puter's `img2img` when available, otherwise passes
 * the source image to `txt2img` under the option keys different builds accept.
 *
 * If the SDK ignores/rejects the source image entirely, the caller falls back to
 * plain text-to-image (the prompt is already vision-informed by the model).
 */
export async function editImage(prompt: string, sourceImage: string): Promise<string> {
  await loadPuter();
  const ai = window.puter?.ai;
  if (!ai?.txt2img) throw new Error("Image generator is unavailable.");

  let lastErr: unknown;
  for (const model of MODEL_CANDIDATES) {
    const shapes: Array<() => Promise<HTMLImageElement | string>> = [
      // Dedicated img2img method, if this SDK build has one.
      ...(ai.img2img
        ? [() => ai.img2img!({ prompt, model, image: sourceImage })]
        : []),
      // txt2img with the source image under the keys various builds use.
      () => ai.txt2img({ prompt, model, input_image: sourceImage } as unknown as string),
      () => ai.txt2img({ prompt, model, image: sourceImage } as unknown as string),
    ];
    for (const run of shapes) {
      try {
        const url = toUrl(await run());
        if (url) return url;
      } catch (e) {
        lastErr = e;
        // Surface genuine failures immediately; keep trying only for
        // model/parameter-shape errors (so we can fall back cleanly).
        const t = errText(e).toLowerCase();
        const recoverable = isModelError(e) || /image|param|argument|unexpected|unknown|invalid/.test(t);
        if (!recoverable) throw new Error(errText(e) || "Image editing failed.");
      }
    }
  }
  throw new Error(errText(lastErr) || "Image-to-image is not supported here.");
}
