import type { Slide } from "@/types";

/**
 * Parses a slide deck out of the streaming answer. The model emits
 * `[[slides:Deck Title]]` then one block per slide:
 *   <koda-slide title="Slide title" notes="optional speaker notes">
 *   - bullet one
 *   - bullet two
 *   </koda-slide>
 */

const DIRECTIVE_RE = /\[\[slides(?::\s*([^\]]*))?\]\]/i;
const SLIDE_RE = /<koda-slide\s+([^>]*)>([\s\S]*?)<\/koda-slide>/gi;

function attr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1].trim() : "";
}

export function parseSlidesDirective(text: string): { title: string } | null {
  const m = text.match(DIRECTIVE_RE);
  if (!m) return null;
  return { title: (m[1] || "").trim() || "Presentation" };
}

export function parseSlides(text: string): Slide[] {
  const re = new RegExp(SLIDE_RE.source, SLIDE_RE.flags);
  const out: Slide[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const attrs = m[1];
    const body = m[2];
    const title = attr(attrs, "title") || "Untitled slide";
    const notes = attr(attrs, "notes") || undefined;
    const bullets = body
      .split("\n")
      .map((l) => l.replace(/^\s*[-*•]\s?/, "").trim())
      .filter(Boolean);
    out.push({ title, bullets, notes });
  }
  return out;
}

export function hasSlidesSyntax(text: string): boolean {
  return DIRECTIVE_RE.test(text) || /<koda-slide/i.test(text);
}

export function stripSlidesSyntax(text: string): string {
  return text
    .replace(DIRECTIVE_RE, "")
    .replace(new RegExp(SLIDE_RE.source, "gi"), "")
    .replace(/<koda-slide[\s\S]*$/i, "") // trailing unclosed block while streaming
    .replace(/\[\[slides[^\]]*$/i, "")
    .replace(/^\s+/, "");
}
