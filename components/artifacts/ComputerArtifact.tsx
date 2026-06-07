"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js";
import {
  ChevronRight,
  Download,
  ExternalLink,
  File as FileIcon,
  FileCode2,
  Folder,
  FolderOpen,
  Loader2,
  Monitor,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { useKodaStore } from "@/lib/store";
import { buildPreviewSrcDoc } from "@/lib/computerPreview";
import { downloadZip } from "@/lib/zip";
import { cn } from "@/lib/utils";
import type { ComputerStatus, ProjectFile } from "@/types";

type Tab = "preview" | "code" | "terminal";

const HLJS_LANG: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript",
  ts: "typescript", tsx: "typescript",
  html: "xml", htm: "xml", svg: "xml", xml: "xml",
  css: "css", json: "json", md: "markdown",
};

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i + 1).toLowerCase() : "";
}

export function ComputerArtifact() {
  const computer = useKodaStore((s) => s.computer);
  const setActive = useKodaStore((s) => s.setComputerActiveFile);
  const [tab, setTab] = useState<Tab>("code");
  const [runKey, setRunKey] = useState(0);
  const termRef = useRef<HTMLDivElement>(null);

  const files = computer?.files ?? [];
  const status = computer?.status ?? "building";
  const activePath = computer?.activePath;
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  // Auto-jump to the preview once the dev server is "running".
  const ranRef = useRef(false);
  useEffect(() => {
    if ((status === "running" || status === "ready") && !ranRef.current && files.length) {
      ranRef.current = true;
      setTab("preview");
    }
  }, [status, files.length]);

  // Keep the terminal scrolled to the latest line.
  useEffect(() => {
    if (tab === "terminal" && termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [computer?.terminal, tab]);

  const srcDoc = useMemo(
    () => buildPreviewSrcDoc(files),
    // Rebuild whenever file contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(files), runKey]
  );

  if (!computer) return null;

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
          <TabBtn active={tab === "terminal"} onClick={() => setTab("terminal")} icon={<TerminalSquare className="h-3.5 w-3.5" />} label="Terminal" />
        </div>

        <StatusPill status={status} />

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
            onClick={() => downloadZip(computer.title, files)}
            disabled={!files.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-koda-border bg-koda-surface px-2.5 py-1.5 text-xs font-medium text-koda-text transition-colors hover:bg-koda-surface-2 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        {tab === "preview" && (
          <iframe
            key={runKey}
            title={`${computer.title} preview`}
            sandbox="allow-scripts allow-modals allow-popups allow-forms allow-same-origin"
            className="h-full w-full bg-white"
            srcDoc={srcDoc}
          />
        )}

        {tab === "code" && (
          <div className="flex h-full">
            <FileTree
              files={files}
              activePath={activeFile?.path}
              onSelect={setActive}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              {activeFile ? (
                <CodeView file={activeFile} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-koda-muted">
                  {status === "building" ? "Generating files…" : "No files yet."}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "terminal" && (
          <div
            ref={termRef}
            className="h-full overflow-y-auto bg-[#0c0c0f] p-3 font-mono text-[12.5px] leading-relaxed text-koda-text/90"
          >
            {computer.terminal.length === 0 ? (
              <span className="text-koda-muted">Terminal is ready — build steps will appear here.</span>
            ) : (
              computer.terminal.map((line, i) => (
                <div key={i} className={cn("whitespace-pre-wrap", line.includes("$") && "text-koda-accent-soft")}>
                  {line || " "}
                </div>
              ))
            )}
            {(status === "installing" || status === "running" || status === "building") && (
              <div className="mt-1 inline-block h-3.5 w-2 animate-pulse bg-koda-accent align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── File tree (inspect) ──────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  children?: Map<string, TreeNode>;
}

function buildTree(files: ProjectFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      if (!node.children) node.children = new Map();
      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: isFile ? undefined : new Map(),
        };
        node.children.set(part, child);
      }
      node = child;
    });
  }
  return root;
}

function FileTree({
  files,
  activePath,
  onSelect,
}: {
  files: ProjectFile[];
  activePath?: string;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  return (
    <div className="w-32 shrink-0 overflow-y-auto border-r border-koda-border bg-koda-surface/40 py-2 sm:w-44 md:w-52">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-koda-muted">Files</p>
      {tree.children && [...tree.children.values()].sort(sortNodes).map((n) => (
        <TreeRow key={n.path} node={n} depth={0} activePath={activePath} onSelect={onSelect} />
      ))}
    </div>
  );
}

function sortNodes(a: TreeNode, b: TreeNode): number {
  const aDir = !!a.children, bDir = !!b.children;
  if (aDir !== bDir) return aDir ? -1 : 1; // folders first
  return a.name.localeCompare(b.name);
}

function TreeRow({
  node,
  depth,
  activePath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  activePath?: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isDir = !!node.children;
  const active = node.path === activePath;

  if (isDir) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1 px-2 py-1 text-left text-[13px] text-koda-text/80 hover:bg-koda-surface-2"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")} />
          {open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-koda-accent/70" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-koda-accent/70" />}
          <span className="truncate">{node.name}</span>
        </button>
        {open &&
          node.children &&
          [...node.children.values()].sort(sortNodes).map((c) => (
            <TreeRow key={c.path} node={c} depth={depth + 1} activePath={activePath} onSelect={onSelect} />
          ))}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      className={cn(
        "flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px] hover:bg-koda-surface-2",
        active ? "bg-koda-surface-2 text-koda-text" : "text-koda-muted"
      )}
      style={{ paddingLeft: 8 + depth * 12 + 12 }}
    >
      <FileIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

// ─── Code view ────────────────────────────────────────────────

function CodeView({ file }: { file: ProjectFile }) {
  const html = useMemo(() => {
    const lang = HLJS_LANG[extOf(file.path)];
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(file.content, { language: lang }).value;
      }
      return hljs.highlightAuto(file.content).value;
    } catch {
      return escapeHtml(file.content);
    }
  }, [file.path, file.content]);

  const lines = file.content.split("\n").length;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-koda-border bg-koda-surface/30 px-3 py-1.5 text-xs text-koda-muted">
        <FileCode2 className="h-3.5 w-3.5" />
        <span className="truncate font-mono text-koda-text/80">{file.path}</span>
        <span className="ml-auto">{lines} lines</span>
      </div>
      <div className="flex-1 overflow-auto bg-[#0e0e11]">
        <pre className="p-4 text-[13px] leading-relaxed">
          <code className="hljs bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Small UI bits ────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
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

function IconBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
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

const STATUS_LABEL: Record<ComputerStatus, string> = {
  building: "Building",
  installing: "Installing",
  running: "Starting dev server",
  ready: "Live",
  error: "Error",
};

function StatusPill({ status }: { status: ComputerStatus }) {
  const busy = status === "building" || status === "installing" || status === "running";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        status === "ready" && "bg-emerald-500/15 text-emerald-300",
        status === "error" && "bg-red-500/15 text-red-300",
        busy && "bg-koda-accent/15 text-koda-accent-soft"
      )}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span className={cn("h-1.5 w-1.5 rounded-full", status === "ready" ? "bg-emerald-400" : "bg-red-400")} />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}
