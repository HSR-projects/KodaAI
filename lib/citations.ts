import type { Source } from "@/types";

/** A segment of answer text: plain prose or an inline citation marker. */
export type AnswerSegment =
  | { type: "text"; value: string }
  | { type: "citation"; index: number; source?: Source };

const CITATION_RE = /\[(\d{1,2})\]/g;

/**
 * Split a string into text + citation segments, resolving each [n] marker to
 * its source (1-based index into `sources`). Used by the markdown renderer.
 */
export function parseCitations(
  text: string,
  sources: Source[] = []
): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: "text", value: text.slice(last, m.index) });
    }
    const index = parseInt(m[1], 10);
    segments.push({
      type: "citation",
      index,
      source: sources[index - 1],
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments;
}

/** Distinct source indices actually referenced in the answer text. */
export function usedCitationIndices(text: string): number[] {
  const set = new Set<number>();
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(text)) !== null) {
    set.add(parseInt(m[1], 10));
  }
  return [...set].sort((a, b) => a - b);
}
