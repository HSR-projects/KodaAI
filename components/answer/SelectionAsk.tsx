"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, BookOpen, FileText, Languages } from "lucide-react";
import { useKodaStore } from "@/lib/store";

interface PopState {
  text: string;
  x: number;
  y: number;
}

const ACTIONS = [
  {
    id: "ask",
    label: "Ask Koda AI",
    icon: Sparkles,
    build: (text: string) =>
      `${text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}\n\n`,
    primary: true,
  },
  {
    id: "explain",
    label: "Explain",
    icon: BookOpen,
    build: (text: string) => `Explain this in simple terms:\n\n> ${text.trim()}\n\n`,
    primary: false,
  },
  {
    id: "summarize",
    label: "Summarize",
    icon: FileText,
    build: (text: string) => `Summarize the key points of:\n\n> ${text.trim()}\n\n`,
    primary: false,
  },
  {
    id: "translate",
    label: "Translate",
    icon: Languages,
    build: (text: string) => `Translate the following to English:\n\n> ${text.trim()}\n\n`,
    primary: false,
  },
] as const;

export function SelectionAsk({ containerRef }: { containerRef: React.RefObject<HTMLElement> }) {
  const [pop, setPop] = useState<PopState | null>(null);
  const setComposerDraft = useKodaStore((s) => s.setComposerDraft);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const evaluate = (target: EventTarget | null) => {
      if (popRef.current && target instanceof Node && popRef.current.contains(target)) return;

      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      const container = containerRef.current;
      if (!sel || !text || text.length < 2 || !container) {
        setPop(null);
        return;
      }
      const anchor = sel.anchorNode;
      if (!anchor || !container.contains(anchor)) {
        setPop(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) { setPop(null); return; }

      // Clamp horizontally — popover is ~280px wide
      const half = 140;
      const x = Math.max(half, Math.min(window.innerWidth - half, rect.left + rect.width / 2));
      setPop({ text, x, y: rect.top - 8 });
    };

    const onUp = (e: MouseEvent) => evaluate(e.target);
    const onTouchEnd = (e: TouchEvent) => { const t = e.target; setTimeout(() => evaluate(t), 50); };
    const onDown = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      setPop(null);
    };
    const onScroll = () => setPop(null);

    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [containerRef]);

  const fire = (build: (text: string) => string) => {
    if (!pop) return;
    setComposerDraft(build(pop.text));
    setPop(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <AnimatePresence>
      {pop && (
        <motion.div
          ref={popRef}
          key="selection-popover"
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.96 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          onMouseDown={(e) => e.preventDefault()}
          style={{ left: pop.x, top: pop.y }}
          className="fixed z-50 -translate-x-1/2 -translate-y-full"
        >
          {/* Card */}
          <div className="flex items-center gap-0.5 rounded-xl border border-koda-border bg-koda-surface/95 p-1 shadow-xl shadow-black/40 backdrop-blur-xl">
            {ACTIONS.map((action, i) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => fire(action.build)}
                  className={[
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                    action.primary
                      ? "bg-koda-accent/20 text-koda-accent-soft hover:bg-koda-accent/30"
                      : "text-koda-muted hover:bg-koda-surface-2 hover:text-koda-text",
                    i < ACTIONS.length - 1 ? "" : "",
                  ].join(" ")}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className={action.primary ? "" : "hidden sm:inline"}>{action.label}</span>
                </button>
              );
            })}
          </div>

          {/* Caret pointing down toward the selection */}
          <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2">
            <div className="h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-koda-border" />
            <div className="absolute left-1/2 -translate-x-1/2 -top-[5px] h-0 w-0 border-x-[5px] border-t-[5px] border-x-transparent border-t-koda-surface/95" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
