"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useKodaStore } from "@/lib/store";
import { downloadXlsx, downloadCsv } from "@/lib/xlsx";
import type { SheetTable } from "@/types";
import { cn } from "@/lib/utils";

export function SheetArtifact() {
  const wb = useKodaStore((s) => s.workbook);
  const [activeSheet, setActiveSheet] = useState(0);

  const sheets = wb?.sheets ?? [];

  useEffect(() => {
    if (activeSheet >= sheets.length) setActiveSheet(0);
  }, [sheets.length, activeSheet]);

  if (!wb) return null;
  const sheet = sheets[activeSheet];

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar — wraps on narrow / mobile panels. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-koda-border px-3 py-2">
        <span className="text-xs text-koda-muted">
          {sheets.length} sheet{sheets.length === 1 ? "" : "s"}
          {wb.status === "building" && " · generating…"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => sheet && downloadCsv(`${wb.title}-${sheet.name}`, sheet.rows)}
            disabled={!sheet?.rows.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-koda-border bg-koda-surface px-2.5 py-1.5 text-xs text-koda-text transition-colors hover:bg-koda-surface-2 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> .csv
          </button>
          <button
            type="button"
            onClick={() => downloadXlsx(wb.title, sheets)}
            disabled={!sheets.length}
            className="inline-flex items-center gap-1.5 rounded-lg bg-koda-accent px-2.5 py-1.5 text-xs font-medium text-black transition-colors hover:bg-koda-accent-soft disabled:opacity-50"
          >
            {wb.status === "building" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            .xlsx
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {sheet && sheet.rows.length ? (
          <Grid sheet={sheet} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-koda-muted">
            {wb.status === "building" ? "Generating spreadsheet…" : "No data yet."}
          </div>
        )}
      </div>

      {/* Sheet tabs */}
      {sheets.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-t border-koda-border px-2 py-1.5 [scrollbar-width:thin]">
          {sheets.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSheet(i)}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors",
                i === activeSheet
                  ? "bg-koda-surface-2 text-koda-text"
                  : "text-koda-muted hover:bg-koda-surface-2/60"
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Grid({ sheet }: { sheet: SheetTable }) {
  const [header, ...body] = sheet.rows;
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10">
        <tr>
          <th className="w-10 border border-koda-border bg-koda-surface-2 px-2 py-1.5 text-[10px] font-normal text-koda-muted" />
          {header?.map((cell, i) => (
            <th
              key={i}
              className="border border-koda-border bg-koda-surface-2 px-3 py-1.5 text-left font-semibold text-koda-text"
            >
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, r) => (
          <tr key={r} className="even:bg-koda-surface/40">
            <td className="border border-koda-border bg-koda-surface-2 px-2 py-1.5 text-center text-[10px] text-koda-muted">
              {r + 1}
            </td>
            {header?.map((_h, c) => (
              <td key={c} className="border border-koda-border px-3 py-1.5 text-koda-text/90">
                {row[c] ?? ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
