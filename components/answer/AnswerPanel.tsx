"use client";

import React, { useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { motion } from "framer-motion";
import { AlertTriangle, Download, Package, Loader2, MonitorPlay, Presentation, FileSpreadsheet, Globe, Crown, ChevronRight } from "lucide-react";
import type { GeneratedImage, Message } from "@/types";
import { useKodaStore } from "@/lib/store";
import { parseCitations } from "@/lib/citations";
import { CitationBadge } from "./CitationBadge";
import { CodeBlock } from "./CodeBlock";
import { StreamingCursor } from "./StreamingCursor";

interface CodeFile {
  lang: string;
  code: string;
  filename: string;
}

const LANG_EXT: Record<string, string> = {
  html: "html", htm: "html", css: "css",
  js: "js", javascript: "js", jsx: "jsx",
  ts: "ts", typescript: "ts", tsx: "tsx",
  py: "py", python: "py", json: "json",
  yaml: "yml", yml: "yml", sh: "sh", bash: "sh",
  sql: "sql", md: "md", php: "php", ruby: "rb",
  rust: "rs", go: "go", java: "java", c: "c", cpp: "cpp",
  xml: "xml", svg: "svg",
};

const FILE_COUNTER: Record<string, number> = {};

function guessFilename(lang: string, code: string, index: number): string {
  const first = code.split("\n")[0].trim();
  const patterns = [
    /^\/\/\s*([\w.-]+\.\w+)/,
    /^\/\*+\s*([\w.-]+\.\w+)/,
    /^<!--\s*([\w.-]+\.\w+)/,
    /^#\s*([\w.-]+\.\w+)/,
  ];
  for (const p of patterns) {
    const m = first.match(p);
    if (m) return m[1];
  }
  const ext = LANG_EXT[lang] ?? lang ?? "txt";
  const defaults: Record<string, string> = {
    html: "index.html", css: "styles.css",
    js: "script.js", javascript: "script.js",
    jsx: "App.jsx", tsx: "App.tsx", ts: "index.ts",
    py: "main.py",
  };
  return defaults[lang] ?? `file${index + 1}.${ext}`;
}

function extractCodeBlocks(markdown: string): CodeFile[] {
  const re = /```(\w+)\n([\s\S]*?)```/g;
  const blocks: CodeFile[] = [];
  // reset counter
  Object.keys(FILE_COUNTER).forEach((k) => delete FILE_COUNTER[k]);
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const lang = m[1].toLowerCase();
    const code = m[2].trimEnd();
    blocks.push({ lang, code, filename: guessFilename(lang, code, blocks.length) });
  }
  return blocks;
}

const WEB_LANGS = new Set(["html", "htm", "css", "js", "javascript", "jsx", "ts", "tsx"]);

function bundleWebFiles(files: CodeFile[]): string {
  const htmlFile = files.find((f) => f.lang === "html" || f.lang === "htm");
  const cssFiles = files.filter((f) => f.lang === "css");
  const jsFiles = files.filter((f) => WEB_LANGS.has(f.lang) && f.lang !== "html" && f.lang !== "htm" && f.lang !== "css");

  const cssBlock = cssFiles.map((f) => f.code).join("\n");
  const jsBlock = jsFiles.map((f) => f.code).join("\n");

  if (htmlFile) {
    let doc = htmlFile.code;
    if (!/<html[\s>]/i.test(doc) && !/<!doctype/i.test(doc)) {
      doc = `<!doctype html><html><head><meta charset="utf-8"></head><body>${doc}</body></html>`;
    }
    if (cssBlock) doc = doc.replace("</head>", `<style>\n${cssBlock}\n</style>\n</head>`);
    if (jsBlock) doc = doc.replace("</body>", `<script>\n${jsBlock}\n</script>\n</body>`);
    return doc;
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${cssBlock}
</style>
</head>
<body>
<script>
${jsBlock}
</script>
</body>
</html>`;
}

function downloadBlob(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DownloadBar({ content }: { content: string }) {
  const files = useMemo(() => extractCodeBlocks(content), [content]);
  if (files.length < 2) return null;

  const hasWeb = files.some((f) => WEB_LANGS.has(f.lang));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-koda-border bg-koda-surface/60 px-3.5 py-2.5">
      <Package className="h-3.5 w-3.5 shrink-0 text-koda-accent" />
      <span className="text-xs font-medium text-koda-text/80">
        {files.length} files detected
      </span>
      <div className="ml-auto flex flex-wrap gap-1.5">
        {files.map((f, i) => (
          <button
            key={i}
            onClick={() => downloadBlob(f.code, f.filename)}
            className="inline-flex items-center gap-1 rounded-md border border-koda-border bg-koda-surface px-2 py-1 text-[11px] text-koda-muted transition-colors hover:bg-koda-surface-2 hover:text-koda-text"
          >
            <Download className="h-3 w-3" />
            {f.filename}
          </button>
        ))}
        {hasWeb && (
          <button
            onClick={() => downloadBlob(bundleWebFiles(files), "project.html", "text/html")}
            className="inline-flex items-center gap-1 rounded-md border border-koda-accent/40 bg-koda-accent/10 px-2.5 py-1 text-[11px] font-medium text-koda-accent-soft transition-colors hover:bg-koda-accent/20"
          >
            <Package className="h-3 w-3" />
            Bundle as HTML
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Walk React children and replace inline [n] markers in string nodes with
 * <CitationBadge> elements resolved against the message's sources.
 */
function injectCitations(
  children: ReactNode,
  sources: Message["sources"] = []
): ReactNode {
  return React.Children.map(children, (child, i) => {
    if (typeof child === "string") {
      const segments = parseCitations(child, sources);
      if (segments.length === 1 && segments[0].type === "text") return child;
      return segments.map((seg, j) =>
        seg.type === "text" ? (
          <React.Fragment key={j}>{seg.value}</React.Fragment>
        ) : (
          <CitationBadge key={j} index={seg.index} source={seg.source} />
        )
      );
    }
    if (React.isValidElement(child)) {
      const el = child as React.ReactElement<{ children?: ReactNode }>;
      // Don't descend into code — citations there are literal.
      if (el.type === "code" || el.type === CodeBlock) return child;
      if (el.props?.children) {
        return React.cloneElement(el, {
          ...el.props,
          children: injectCitations(el.props.children, sources),
        });
      }
    }
    return child;
  });
}

export function AnswerPanel({ message }: { message: Message }) {
  const sources = message.sources ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {message.error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Something went wrong</p>
            <p className="mt-1 text-red-200/80">{message.error}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="prose prose-invert max-w-none prose-headings:text-koda-text prose-p:text-koda-text/90 prose-li:text-koda-text/90 prose-strong:text-koda-text prose-a:text-koda-accent-soft prose-code:text-koda-accent-soft prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                p: ({ children }) => <p>{injectCitations(children, sources)}</p>,
                li: ({ children }) => <li>{injectCitations(children, sources)}</li>,
                td: ({ children }) => <td>{injectCitations(children, sources)}</td>,
                h1: ({ children }) => <h1>{injectCitations(children, sources)}</h1>,
                h2: ({ children }) => <h2>{injectCitations(children, sources)}</h2>,
                h3: ({ children }) => <h3>{injectCitations(children, sources)}</h3>,
                pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {message.content || (message.streaming ? "" : "")}
            </ReactMarkdown>
            {message.streaming && <StreamingCursor />}
          </div>
          {message.computer && <ComputerCard snapshot={message.computer} />}
          {message.slides && message.slides.slides.length > 0 && (
            <SlidesCard snapshot={message.slides} />
          )}
          {message.sheet && message.sheet.sheets.length > 0 && (
            <SheetCard snapshot={message.sheet} />
          )}
          {message.website && message.website.files.length > 0 && (
            <WebsiteCard snapshot={message.website} />
          )}
          {message.chess && <ChessCard playerColor={message.chess.playerColor} />}
          {message.generatedImages && message.generatedImages.length > 0 && (
            <GeneratedImages images={message.generatedImages} />
          )}
          {!message.streaming && message.content && (
            <DownloadBar content={message.content} />
          )}
        </>
      )}
    </motion.div>
  );
}

/**
 * Inline card for a Koda's Computer build. Clicking restores the sandbox from
 * the snapshot saved on the message — so it works even after the panel was
 * closed, the page reloaded, or the chat was revisited, with no re-generation.
 */
function ComputerCard({
  snapshot,
}: {
  snapshot: NonNullable<Message["computer"]>;
}) {
  const loadComputer = useKodaStore((s) => s.loadComputer);
  const fileCount = snapshot.files?.length ?? 0;

  return (
    <button
      type="button"
      onClick={() => loadComputer(snapshot)}
      className="group mt-3 flex w-full items-center gap-3 rounded-xl border border-koda-border bg-koda-surface/60 px-3.5 py-3 text-left transition-colors hover:border-koda-accent/40 hover:bg-koda-surface-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-koda-accent/15 text-koda-accent">
        <MonitorPlay className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-koda-text">{snapshot.title}</span>
        <span className="block text-xs text-koda-muted">
          Koda&apos;s Computer · {fileCount} file{fileCount === 1 ? "" : "s"} · click to open
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-koda-muted transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/** Inline card to re-open a generated slide deck from the saved snapshot. */
function SlidesCard({
  snapshot,
}: {
  snapshot: NonNullable<Message["slides"]>;
}) {
  const loadSlides = useKodaStore((s) => s.loadSlides);
  const n = snapshot.slides.length;
  return (
    <button
      type="button"
      onClick={() => loadSlides(snapshot)}
      className="group mt-3 flex w-full items-center gap-3 rounded-xl border border-koda-border bg-koda-surface/60 px-3.5 py-3 text-left transition-colors hover:border-koda-accent/40 hover:bg-koda-surface-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-koda-accent/15 text-koda-accent">
        <Presentation className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-koda-text">{snapshot.title}</span>
        <span className="block text-xs text-koda-muted">
          Presentation · {n} slide{n === 1 ? "" : "s"} · click to open &amp; download
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-koda-muted transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/** Inline card to re-open a generated spreadsheet from the saved snapshot. */
function SheetCard({
  snapshot,
}: {
  snapshot: NonNullable<Message["sheet"]>;
}) {
  const loadWorkbook = useKodaStore((s) => s.loadWorkbook);
  const n = snapshot.sheets.length;
  return (
    <button
      type="button"
      onClick={() => loadWorkbook(snapshot)}
      className="group mt-3 flex w-full items-center gap-3 rounded-xl border border-koda-border bg-koda-surface/60 px-3.5 py-3 text-left transition-colors hover:border-koda-accent/40 hover:bg-koda-surface-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-koda-accent/15 text-koda-accent">
        <FileSpreadsheet className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-koda-text">{snapshot.title}</span>
        <span className="block text-xs text-koda-muted">
          Spreadsheet · {n} sheet{n === 1 ? "" : "s"} · click to open &amp; download
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-koda-muted transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/** Inline card to re-open a generated website from the saved snapshot. */
function WebsiteCard({
  snapshot,
}: {
  snapshot: NonNullable<Message["website"]>;
}) {
  const loadWebsite = useKodaStore((s) => s.loadWebsite);
  const n = snapshot.files.length;
  return (
    <button
      type="button"
      onClick={() => loadWebsite(snapshot)}
      className="group mt-3 flex w-full items-center gap-3 rounded-xl border border-koda-border bg-koda-surface/60 px-3.5 py-3 text-left transition-colors hover:border-koda-accent/40 hover:bg-koda-surface-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-koda-accent/15 text-koda-accent">
        <Globe className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-koda-text">{snapshot.title}</span>
        <span className="block text-xs text-koda-muted">
          Website · {n} file{n === 1 ? "" : "s"} · click to preview &amp; download
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-koda-muted transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/** Inline card to resume a chess game — reopens the board in the side panel. */
function ChessCard({ playerColor }: { playerColor: "white" | "black" }) {
  const openArtifact = useKodaStore((s) => s.openArtifact);
  return (
    <button
      type="button"
      onClick={() => openArtifact({ type: "chess", title: "Chess", playerColor })}
      className="group mt-3 flex w-full items-center gap-3 rounded-xl border border-koda-border bg-koda-surface/60 px-3.5 py-3 text-left transition-colors hover:border-koda-accent/40 hover:bg-koda-surface-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-koda-accent/15 text-koda-accent">
        <Crown className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-koda-text">Chess</span>
        <span className="block text-xs text-koda-muted">
          You play {playerColor} · click to open &amp; resume the game
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-koda-muted transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function GeneratedImages({ images }: { images: GeneratedImage[] }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {images.map((img) => (
        <div
          key={img.id}
          className="overflow-hidden rounded-xl border border-koda-border bg-koda-surface/60"
        >
          {img.status === "done" && img.url ? (
            <figure className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.prompt} className="block w-full" />
              <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate text-xs text-koda-muted" title={img.prompt}>
                  {img.prompt}
                </span>
                <a
                  href={img.url}
                  download={`koda-image-${img.id}.png`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-koda-border bg-koda-surface px-2 py-1 text-[11px] text-koda-muted transition-colors hover:bg-koda-surface-2 hover:text-koda-text"
                >
                  <Download className="h-3 w-3" /> Save
                </a>
              </figcaption>
            </figure>
          ) : img.status === "error" ? (
            <div className="flex items-start gap-2 p-4 text-sm text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Couldn&apos;t generate the image{img.error ? `: ${img.error}` : "."}
              </span>
            </div>
          ) : (
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-koda-surface-2/40 text-koda-muted">
              <Loader2 className="h-6 w-6 animate-spin text-koda-accent" />
              <span className="px-4 text-center text-xs">Generating image…</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
