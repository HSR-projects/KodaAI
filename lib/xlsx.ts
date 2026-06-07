import { zipFiles } from "@/lib/zip";

/**
 * Minimal, dependency-free .xlsx (SpreadsheetML) writer. Produces a valid
 * Office Open XML workbook from plain string rows using inline strings (no
 * sharedStrings table), packaged with the existing STORE-method zip writer.
 * Numeric-looking cells are written as numbers so Excel treats them as such.
 */

export interface SheetData {
  name: string;
  rows: string[][];
}

// Control characters that are illegal in XML 1.0 (keep \t \n \r).
// eslint-disable-next-line no-control-regex
const ILLEGAL_XML = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

function escapeXml(s: string): string {
  return s
    .replace(ILLEGAL_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 0-based column index → spreadsheet column letters (0→A, 26→AA). */
function colLetter(n: number): string {
  let s = "";
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

function cellXml(value: string, ref: string): string {
  const v = value ?? "";
  if (v !== "" && NUMERIC.test(v.trim())) {
    return `<c r="${ref}"><v>${v.trim()}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
}

function sheetXml(rows: string[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row.map((cell, c) => cellXml(cell, `${colLetter(c)}${r + 1}`)).join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function safeSheetName(name: string, i: number): string {
  // Excel forbids : \ / ? * [ ] and a 31-char limit.
  const cleaned = (name || `Sheet${i + 1}`).replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return cleaned || `Sheet${i + 1}`;
}

/** Build an .xlsx Blob from one or more sheets. */
export function buildXlsx(sheets: SheetData[]): Blob {
  const list = sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
  const names = list.map((s, i) => safeSheetName(s.name, i));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${list.map((_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("\n")}
</sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${list.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
</Relationships>`;

  const files = [
    { path: "[Content_Types].xml", content: contentTypes },
    { path: "_rels/.rels", content: rootRels },
    { path: "xl/workbook.xml", content: workbook },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRels },
    ...list.map((s, i) => ({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      content: sheetXml(s.rows),
    })),
  ];

  return zipFiles(files);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") || "workbook";
}

export function downloadXlsx(name: string, sheets: SheetData[]) {
  triggerDownload(buildXlsx(sheets), `${slug(name)}.xlsx`);
}

/** Quote a CSV field per RFC 4180 when it contains delimiters/quotes/newlines. */
function csvField(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Download a single sheet's rows as a .csv file (UTF-8 BOM for Excel). */
export function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvField).join(",")).join("\r\n");
  triggerDownload(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${slug(name)}.csv`);
}
