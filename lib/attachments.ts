import type { Attachment, AttachmentKind } from "@/types";
import { uid } from "@/lib/utils";

// ─── Limits ───────────────────────────────────────────────────
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_TEXT_BYTES = 1 * 1024 * 1024; // 1 MB
export const MAX_ATTACHMENTS = 6;

/** Characters of an inlined text file we forward to the model. */
const MAX_TEXT_CHARS = 20_000;

/** `accept` value for the file picker. */
export const ACCEPT_ATTACHMENTS =
  "image/*,audio/*,text/*,.txt,.md,.markdown,.csv,.json,.xml,.yaml,.yml,.html,.css,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.go,.rs,.rb,.php,.sh,.sql,.log";

/** Extensions we treat as text even when the browser reports no/odd MIME. */
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "json", "xml", "yaml", "yml", "html", "htm",
  "css", "js", "mjs", "ts", "tsx", "jsx", "py", "java", "c", "h", "cpp", "hpp",
  "cc", "go", "rs", "rb", "php", "sh", "bash", "zsh", "sql", "log", "ini", "toml",
  "env", "conf", "cfg", "tex", "rtf",
]);

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function classifyFile(file: File): AttachmentKind {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/")) return "text";
  if (mime === "application/json" || mime === "application/xml") return "text";
  if (TEXT_EXTENSIONS.has(ext(file.name))) return "text";
  return "other";
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Strip the `data:...;base64,` prefix, leaving raw base64. */
function stripDataPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** Resize and convert an image data URL to JPEG via canvas. */
async function makeThumb(dataUrl: string, max = 320, quality = 0.7): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface AttachResult {
  attachment?: Attachment;
  error?: string;
}

/** Read a picked File into an {@link Attachment}, enforcing per-kind size limits. */
export async function fileToAttachment(file: File): Promise<AttachResult> {
  const kind = classifyFile(file);
  const base = {
    id: uid(),
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
  };

  if (kind === "image") {
    if (file.size > MAX_IMAGE_BYTES)
      return { error: `${file.name} is too large (max ${humanSize(MAX_IMAGE_BYTES)}).` };
    const dataUrl = await readAsDataURL(file);
    const thumbUrl = await makeThumb(dataUrl, 320, 0.7);       // small JPEG for UI display
    const modelDataUrl = await makeThumb(dataUrl, 1280, 0.92); // JPEG ≤1280px for vision model
    return {
      attachment: {
        ...base,
        mime: "image/jpeg", // makeThumb always outputs JPEG, ensures Ollama Cloud compat
        kind,
        data: stripDataPrefix(modelDataUrl),
        thumbUrl,
      },
    };
  }

  if (kind === "audio") {
    if (file.size > MAX_AUDIO_BYTES)
      return { error: `${file.name} is too large (max ${humanSize(MAX_AUDIO_BYTES)}).` };
    const dataUrl = await readAsDataURL(file);
    return { attachment: { ...base, kind, data: stripDataPrefix(dataUrl) } };
  }

  if (kind === "text") {
    if (file.size > MAX_TEXT_BYTES)
      return { error: `${file.name} is too large (max ${humanSize(MAX_TEXT_BYTES)}).` };
    const text = await readAsText(file);
    return { attachment: { ...base, kind, data: text } };
  }

  return { error: `${file.name}: unsupported file type.` };
}

/** Lightweight copy stored on a message — drops heavy payloads, keeps thumbnails. */
export function toDisplayAttachment(a: Attachment): Attachment {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    mime: a.mime,
    size: a.size,
    thumbUrl: a.thumbUrl,
  };
}

export interface BuiltAttachments {
  /** The query augmented with inlined text-file content + capability notes. */
  query: string;
  /** Base64 image payloads to send to a vision model (empty if unsupported). */
  images: string[];
}

/**
 * Fold attachments into the outgoing request: inline text files, collect images
 * for vision models, and add a short note when the chosen model can't consume an
 * image/audio attachment so the model (and answer) acknowledges it gracefully.
 */
export function buildAttachments(
  query: string,
  attachments: Attachment[],
  caps: { vision: boolean; audio: boolean }
): BuiltAttachments {
  const images: string[] = [];
  const textBlocks: string[] = [];
  const notes: string[] = [];

  for (const a of attachments) {
    if (a.kind === "image") {
      // Send raw base64 — Ollama Cloud base64-decodes the string directly and
      // detects the MIME type from magic bytes (JPEG: FF D8 FF). Data URIs
      // cause "illegal base64 data at input byte 4" because ":" is not valid b64.
      if (caps.vision && a.data) images.push(a.data);
      else notes.push(`an image "${a.name}" (the current model can't view images — ask the user to switch to a vision model)`);
    } else if (a.kind === "text") {
      const body = (a.data ?? "").slice(0, MAX_TEXT_CHARS);
      const truncated = (a.data?.length ?? 0) > MAX_TEXT_CHARS ? "\n…(truncated)" : "";
      textBlocks.push(`--- File: ${a.name} ---\n${body}${truncated}`);
    } else if (a.kind === "audio") {
      notes.push(
        caps.audio
          ? `an audio file "${a.name}"`
          : `an audio file "${a.name}" (the current model can't process audio — ask the user to switch to an audio-capable model)`
      );
    } else {
      notes.push(`a file "${a.name}" of an unsupported type`);
    }
  }

  let out = query.trim();
  if (textBlocks.length) {
    out = `${textBlocks.join("\n\n")}\n\n${out || "Please review the attached file(s)."}`;
  }
  if (notes.length) {
    out = `${out ? out + "\n\n" : ""}[The user also attached ${notes.join("; ")}.]`;
  }
  // Vision models need *some* prompt text alongside the image.
  if (!out.trim() && (images.length || attachments.length)) {
    out = "Please describe and analyze the attached file(s).";
  }
  return { query: out, images };
}
