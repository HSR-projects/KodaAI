"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js";
import { Download, ExternalLink, FileCode2, Loader2, Monitor, RefreshCw } from "lucide-react";
import { useKodaStore } from "@/lib/store";
import { buildPreviewSrcDoc } from "@/lib/computerPreview";
import { downloadZip } from "@/lib/zip";
import { cn } from "@/lib/utils";

type Tab = "preview" | "code";

const HLJS_LANG: Record<string, string> = {
  js: "javascript", mjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript",
  html: "xml", htm: "xml", svg: "xml", xml: "xml",
  css: "css", json: "json", md: "markdown",
};

function extOf(p: string): string {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i + 1).toLowerCase() : "";
}

export function WebsiteArtifact() {
  const site = useKodaStore((s) => s.website);
  const [tab, setTab] = useState<Tab>("code");
  const [runKey, setRunKey] = useState(0);
  const [activePath, setActivePath] = useState<string | undefined>(undefined);

  const files = useMemo(() => site?.files ?? [], [site?.files]);
  const status = site?.status ?? "building";

  // Pick an initial file, and jump to preview once ready.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (!activePath && files.length) {
      const idx = files.find((f) => /index\.html$/i.test(f.path)) ?? files[0];
      setActivePath(idx.path);
    }
  }, [files, activePath]);
  useEffect(() => {
    if (status === "ready" && !jumpedRef.current && files.length) {
      jumpedRef.current = true;
      setTab("preview");
    }
  }, [status, files.length]);

  const srcDoc = useMemo(
    () => buildPreviewSrcDoc(files),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(files), runKey]
  );

  if (!site) return null;
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  const openInNewTab = () => {
    const blob = new Blob([srcDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar — wraps on narrow / mobile panels. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-koda-border px-3 py-2">
        <div className="flex items-center rounded-lg bg-koda-surface-2 p-0.5">
          <TabBtn active={tab === "preview"} onClick={() => setTab("preview")} icon={<Monitor className="h-3.5 w-3.5" />} label="Preview" />
          <TabBtn active={tab === "code"} onClick={() => setTab("code")} icon={<FileCode2 className="h-3.5 w-3.5" />} label="Code" />
        </div>
        {status === "building" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-koda-muted">
            <Loader2 className="h-3 w-3 animate-spin" /> building…
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {tab === "preview" && (
            <>
              <IconBtn onClick={() => setRunKey((k) => k + 1)} title="Reload preview">
                <RefreshCw className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn onClick={openInNewTab} title="Open in new tab">
                <ExternalLink className="h-3.5 w-3.5" />
              </IconBtn>
            </>
          )}
          <button
            type="button"
            onClick={() => downloadZip(site.title, files)}
            disabled={!files.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-koda-border bg-koda-surface px-2.5 py-1.5 text-xs font-medium text-koda-text transition-colors hover:bg-koda-surface-2 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        {tab === "preview" ? (
          <iframe
            key={runKey}
            title={`${site.title} preview`}
            sandbox="allow-scripts allow-modals allow-popups allow-forms allow-same-origin"
            className="h-full w-full bg-white"
            srcDoc={srcDoc}
          />
        ) : (
          <div className="flex h-full flex-col">
            {/* File selector */}
            <div className="flex flex-wrap gap-1 border-b border-koda-border bg-koda-surface/40 px-2 py-1.5">
              {files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setActivePath(f.path)}
                  className={cn(
                    "rounded-md px-2 py-1 font-mono text-[11px] transition-colors",
                    f.path === activeFile?.path
                      ? "bg-koda-surface-2 text-koda-text"
                      : "text-koda-muted hover:bg-koda-surface-2/60"
                  )}
                >
                  {f.path}
                </button>
              ))}
            </div>
            {activeFile ? (
              <CodeView path={activeFile.path} content={activeFile.content} />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-koda-muted">
                {status === "building" ? "Generating files…" : "No files yet."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CodeView({ path, content }: { path: string; content: string }) {
  const html = useMemo(() => {
    const lang = HLJS_LANG[extOf(path)];
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(content, { language: lang }).value;
      return hljs.highlightAuto(content).value;
    } catch {
      return content.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    }
  }, [path, content]);
  return (
    <div className="flex-1 overflow-auto bg-[#0e0e11]">
      <pre className="p-4 text-[13px] leading-relaxed">
        <code className="hljs bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-koda-accent/20 text-koda-accent-soft" : "text-koda-muted hover:text-koda-text"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-koda-muted transition-colors hover:bg-koda-surface-2 hover:text-koda-text"
    >
      {children}
    </button>
  );
}
