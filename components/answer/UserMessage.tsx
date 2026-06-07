"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Pencil } from "lucide-react";
import type { Message } from "@/types";
import { cn } from "@/lib/utils";

/**
 * A user chat bubble with ChatGPT-style hover actions: copy and edit. Editing
 * turns the bubble into a textarea; saving resends from this turn (the caller
 * truncates the thread and re-sends the edited text).
 */
export function UserMessage({
  message,
  attachmentsSlot,
  onEdit,
  disabled,
}: {
  message: Message;
  attachmentsSlot?: ReactNode;
  onEdit: (text: string) => void;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      const el = taRef.current;
      if (el) {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    }
  }, [editing]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const save = () => {
    const text = draft.trim();
    setEditing(false);
    if (text && text !== message.content) onEdit(text);
    else setDraft(message.content);
  };

  if (editing) {
    return (
      <div className="flex justify-end">
        <div className="w-full max-w-[78%] rounded-2xl border border-koda-border bg-koda-surface-2 px-3 py-2.5">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                setDraft(message.content);
                setEditing(false);
              }
            }}
            className="max-h-60 w-full resize-none bg-transparent text-sm leading-relaxed text-koda-text focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(message.content);
                setEditing(false);
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-koda-muted transition-colors hover:bg-koda-surface hover:text-koda-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!draft.trim() || disabled}
              className="rounded-lg bg-koda-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-koda-accent-soft disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end">
      <div className="max-w-[78%] rounded-2xl rounded-tr-sm border border-koda-border bg-koda-surface-2 px-4 py-2.5 text-sm leading-relaxed text-koda-text shadow-sm">
        {attachmentsSlot}
        <span className="whitespace-pre-wrap">{message.content}</span>
      </div>
      {/* Actions are hover-revealed on desktop but always visible on touch
          devices (no hover), so mobile users can copy/edit. */}
      <div className="mt-1 flex items-center gap-0.5 text-koda-muted opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <Btn label={copied ? "Copied" : "Copy"} onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-koda-accent" /> : <Copy className="h-4 w-4" />}
        </Btn>
        <Btn label="Edit message" onClick={() => setEditing(true)} disabled={disabled}>
          <Pencil className="h-4 w-4" />
        </Btn>
      </div>
    </div>
  );
}

function Btn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-koda-surface-2 hover:text-koda-text",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      {children}
    </button>
  );
}
