import type { SheetTable } from "@/types";

/**
 * Parses a spreadsheet out of the streaming answer. The model emits
 * `[[sheet:Workbook Title]]` then one block per sheet containing a Markdown (or
 * CSV) table:
 *   <koda-sheet name="Q1">
 *   | Category | Jan | Feb |
 *   | --- | --- | --- |
 *   | Revenue | 1000 | 1200 |
 *   </koda-sheet>
 */

const DIRECTIVE_RE = /\[\[sheet(?::\s*([^\]]*))?\]\]/i;
const SHEET_RE = /<koda-sheet\s+([^>]*)>([\s\S]*?)<\/koda-sheet>/gi;

function attr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1].trim() : "";
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
}

/** Parse a block body of Markdown-pipe or CSV rows into a 2-D grid. */
function parseTable(body: string): string[][] {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows: string[][] = [];
  for (const line of lines) {
    let cells: string[];
    if (line.includes("|")) {
      cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    } else if (line.includes(",")) {
      cells = line.split(",").map((c) => c.trim());
    } else {
      cells = [line];
    }
    if (isSeparatorRow(cells)) continue; // drop markdown header underline
    rows.push(cells);
  }
  return rows;
}

export function parseSheetDirective(text: string): { title: string } | null {
  const m = text.match(DIRECTIVE_RE);
  if (!m) return null;
  return { title: (m[1] || "").trim() || "Workbook" };
}

export function parseSheets(text: string): SheetTable[] {
  const re = new RegExp(SHEET_RE.source, SHEET_RE.flags);
  const out: SheetTable[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    i += 1;
    const name = attr(m[1], "name") || `Sheet${i}`;
    const rows = parseTable(m[2]);
    out.push({ name, rows });
  }
  return out;
}

export function hasSheetSyntax(text: string): boolean {
  return DIRECTIVE_RE.test(text) || /<koda-sheet/i.test(text);
}

export function stripSheetSyntax(text: string): string {
  return text
    .replace(DIRECTIVE_RE, "")
    .replace(new RegExp(SHEET_RE.source, "gi"), "")
    .replace(/<koda-sheet[\s\S]*$/i, "")
    .replace(/\[\[sheet[^\]]*$/i, "")
    .replace(/^\s+/, "");
}
