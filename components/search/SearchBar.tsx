"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp, Search, Loader2, Bot, Lock, Network, Link, X, Square, Mic,
  Paperclip, FileText, Music, Image as ImageIcon,
} from "lucide-react";
import type { Attachment, FocusMode } from "@/types";
import { FocusModes } from "./FocusModes";
import { useKodaStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  ACCEPT_ATTACHMENTS, MAX_ATTACHMENTS, fileToAttachment, humanSize,
} from "@/lib/attachments";

// Minimal Web Speech API typings (not in lib.dom for all targets).
interface SpeechRecResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecResult };
}
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: SpeechRecEvent) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
}
type SpeechRecCtor = new () => SpeechRec;

function getSpeechRecognitionCtor(): SpeechRecCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface SearchBarProps {
  focusMode: FocusMode;
  onFocusChange: (m: FocusMode) => void;
  onSubmit: (query: string, attachments?: Attachment[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
  loading?: boolean;
  /** Called when the user clicks Stop while a response is streaming. */
  onStop?: () => void;
  showFocusModes?: boolean;
  className?: string;

  /** Show the file-attachment button (images, text, audio). Default true. */
  showAttach?: boolean;

  /** Show the single-agent toggle. */
  showAgent?: boolean;
  agentMode?: boolean;
  agentLocked?: boolean;
  onAgentToggle?: () => void;

  /** Show the Agent Swarm toggle. */
  showSwarm?: boolean;
  swarmMode?: boolean;
  swarmLocked?: boolean;
  onSwarmToggle?: () => void;

  /** URL focus — paste a URL and the AI reads that page instead of searching. */
  targetUrl?: string;
  onTargetUrlChange?: (url: string) => void;
}

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function SearchBar({
  focusMode,
  onFocusChange,
  onSubmit,
  placeholder = "What would you like to know?",
  autoFocus,
  loading,
  onStop,
  showFocusModes = true,
  className,
  showAttach = true,
  showAgent = false,
  agentMode = false,
  agentLocked = false,
  onAgentToggle,
  showSwarm = false,
  swarmMode = false,
  swarmLocked = false,
  onSwarmToggle,
  targetUrl = "",
  onTargetUrlChange,
}: SearchBarProps) {
  const [value, setValue] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [dictateSupported, setDictateSupported] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRec | null>(null);

  // Auto-resize textarea up to ~5 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Pick up externally-seeded composer text (e.g. "Ask Koda AI" on a selection).
  const composerDraft = useKodaStore((s) => s.composerDraft);
  const clearDraft = useKodaStore((s) => s.setComposerDraft);
  const dictationEnabled = useKodaStore((s) => s.dictationEnabled);
  useEffect(() => {
    if (!composerDraft) return;
    setValue((v) => (v ? v + "\n\n" : "") + composerDraft);
    clearDraft("");
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    });
  }, [composerDraft, clearDraft]);

  // When URL input becomes visible, focus it.
  useEffect(() => {
    if (urlOpen && !targetUrl) urlRef.current?.focus();
  }, [urlOpen, targetUrl]);

  const submit = () => {
    const q = value.trim();
    if ((!q && attachments.length === 0) || loading) return;
    if (listening) {
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
      setListening(false);
    }
    onSubmit(q, attachments.length ? attachments : undefined);
    setValue("");
    setAttachments([]);
    setAttachError(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    setAttachError(null);
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setAttachError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const picked = Array.from(files).slice(0, room);
    setAttachLoading(true);
    const results = await Promise.all(picked.map(fileToAttachment));
    setAttachLoading(false);
    const ok: Attachment[] = [];
    let firstError: string | null = null;
    for (const r of results) {
      if (r.attachment) ok.push(r.attachment);
      else if (r.error && !firstError) firstError = r.error;
    }
    if (ok.length) setAttachments((prev) => [...prev, ...ok]);
    if (firstError) setAttachError(firstError);
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  // ── Dictation (Web Speech API) ──────────────────────────────
  useEffect(() => {
    setDictateSupported(!!getSpeechRecognitionCtor());
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
    };
  }, []);

  const toggleDictation = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = useKodaStore.getState().dictationLang || navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: SpeechRecEvent) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
      finalText = finalText.trim();
      if (finalText) {
        setValue((v) => (v.trim() ? v.replace(/\s*$/, " ") : "") + finalText + " ");
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
      ref.current?.focus();
    } catch {
      setListening(false);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  const commitUrl = () => {
    const trimmed = urlDraft.trim();
    if (isValidUrl(trimmed)) {
      onTargetUrlChange?.(trimmed);
      setUrlDraft("");
    } else if (!trimmed) {
      onTargetUrlChange?.("");
    }
    setUrlOpen(false);
  };

  const clearUrl = () => {
    onTargetUrlChange?.("");
    setUrlDraft("");
    setUrlOpen(false);
  };

  const toggleUrl = () => {
    if (targetUrl) {
      clearUrl();
    } else {
      setUrlOpen((v) => !v);
    }
  };

  const showToolbar = showFocusModes || showAgent || showSwarm || !!onTargetUrlChange;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="group relative flex flex-col gap-2 rounded-2xl border border-koda-border bg-koda-surface px-4 py-3 transition-shadow focus-within:border-koda-accent/50 focus-within:shadow-glow">
        {/* Attachment previews */}
        {(attachments.length > 0 || attachLoading) && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)} />
            ))}
            {attachLoading && (
              <div className="flex items-center gap-2 rounded-lg border border-koda-border bg-koda-surface-2 px-2.5 py-1.5">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-koda-accent" />
                <span className="text-xs text-koda-muted">Reading image…</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          <Search className="mb-1.5 h-5 w-5 shrink-0 text-koda-muted" />
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={placeholder}
            aria-label="Search query"
            className="max-h-[140px] flex-1 resize-none bg-transparent py-1 text-[15px] leading-relaxed text-koda-text placeholder:text-koda-muted focus:outline-none"
          />

          {showAttach && (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPT_ATTACHMENTS}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                aria-label="Attach files"
                title="Attach images, text, or audio"
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-koda-muted transition-colors hover:bg-koda-surface-2 hover:text-koda-text disabled:opacity-50"
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </button>
            </>
          )}

          {dictateSupported && dictationEnabled && (
            <button
              type="button"
              onClick={toggleDictation}
              aria-label={listening ? "Stop dictation" : "Dictate"}
              title={listening ? "Stop dictation" : "Dictate"}
              aria-pressed={listening}
              className={cn(
                "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                listening
                  ? "bg-red-500/15 text-red-400"
                  : "text-koda-muted hover:bg-koda-surface-2 hover:text-koda-text"
              )}
            >
              <Mic className={cn("h-[18px] w-[18px]", listening && "animate-pulse")} />
            </button>
          )}

          {loading && onStop ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop response"
              title="Stop"
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-koda-text text-koda-bg transition-all hover:opacity-90"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={(!value.trim() && attachments.length === 0) || loading}
              aria-label="Send"
              className={cn(
                "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
                (value.trim() || attachments.length > 0) && !loading
                  ? "bg-koda-accent text-black hover:bg-koda-accent-soft hover:shadow-glow"
                  : "bg-koda-surface-2 text-koda-muted"
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {attachError && (
        <p className="-mt-1 px-1 text-xs text-amber-300">{attachError}</p>
      )}

      {/* URL input row — shown when toggled open and no URL is set yet */}
      {urlOpen && !targetUrl && (
        <div className="flex items-center gap-2 rounded-xl border border-koda-border bg-koda-surface px-3 py-2">
          <Link className="h-4 w-4 shrink-0 text-koda-muted" />
          <input
            ref={urlRef}
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitUrl(); }
              if (e.key === "Escape") { setUrlOpen(false); setUrlDraft(""); }
            }}
            onBlur={commitUrl}
            placeholder="Paste a URL — AI reads that page instead of searching"
            className="flex-1 bg-transparent text-sm text-koda-text placeholder:text-koda-muted focus:outline-none"
          />
          <button
            onClick={() => { setUrlOpen(false); setUrlDraft(""); }}
            className="text-koda-muted hover:text-koda-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showToolbar && (
        <div className="flex flex-wrap items-center gap-1.5">
          {showFocusModes && (
            <FocusModes value={focusMode} onChange={onFocusChange} />
          )}

          {/* URL chip */}
          {onTargetUrlChange && (
            <button
              type="button"
              onClick={toggleUrl}
              title={targetUrl ? `Focused on ${domain(targetUrl)} — click to clear` : "Focus on a specific URL"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                targetUrl
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                  : urlOpen
                    ? "border-koda-accent/40 bg-koda-accent/10 text-koda-accent-soft"
                    : "border-koda-border bg-koda-surface text-koda-muted hover:bg-koda-surface-2 hover:text-koda-text"
              )}
            >
              <Link className="h-3.5 w-3.5" />
              {targetUrl ? (
                <>
                  <span className="max-w-[120px] truncate">{domain(targetUrl)}</span>
                  <X className="h-3 w-3 opacity-60" />
                </>
              ) : (
                "URL"
              )}
            </button>
          )}

          {/* Agent toggle */}
          {showAgent && (
            <button
              type="button"
              onClick={onAgentToggle}
              title={agentLocked ? "Autonomous agent — upgrade to Pro" : "Autonomous multi-step research"}
              aria-pressed={agentMode}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                agentMode && !agentLocked
                  ? "border-koda-accent/50 bg-koda-accent/15 text-koda-accent-soft"
                  : "border-koda-border bg-koda-surface text-koda-muted hover:bg-koda-surface-2 hover:text-koda-text"
              )}
            >
              <Bot className="h-3.5 w-3.5" />
              Agent
              {agentLocked ? (
                <Lock className="h-3 w-3" />
              ) : agentMode ? (
                <span className="h-1.5 w-1.5 rounded-full bg-koda-accent" aria-hidden />
              ) : null}
            </button>
          )}

          {/* Swarm toggle */}
          {showSwarm && (
            <button
              type="button"
              onClick={onSwarmToggle}
              title={swarmLocked ? "Agent Swarm — upgrade to Pro" : "Parallel AI specialists (Agent Swarm)"}
              aria-pressed={swarmMode}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                swarmMode && !swarmLocked
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                  : "border-koda-border bg-koda-surface text-koda-muted hover:bg-koda-surface-2 hover:text-koda-text"
              )}
            >
              <Network className="h-3.5 w-3.5" />
              Swarm
              {swarmLocked ? (
                <Lock className="h-3 w-3" />
              ) : swarmMode ? (
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden />
              ) : null}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const { kind, name, size, thumbUrl } = attachment;

  if (kind === "image" && thumbUrl) {
    return (
      <div className="group/att relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-koda-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl} alt={name} className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover/att:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const Icon = kind === "audio" ? Music : kind === "image" ? ImageIcon : FileText;

  return (
    <div className="flex max-w-[220px] items-center gap-2 rounded-lg border border-koda-border bg-koda-surface-2 px-2.5 py-1.5">
      <Icon className="h-4 w-4 shrink-0 text-koda-muted" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-xs text-koda-text">{name}</span>
        <span className="text-[10px] text-koda-muted">{humanSize(size)}</span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="shrink-0 text-koda-muted hover:text-koda-text"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
