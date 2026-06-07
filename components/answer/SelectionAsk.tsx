"use client";

import { useEffect, useRef, useState } from "react";
import { Quote } from "lucide-react";
import { useKodaStore } from "@/lib/store";

interface PopState {
  text: string;
  x: number;
  y: number;
}

/**
 * ChatGPT-style "Ask Koda AI" popover. When the user selects text inside the
 * given container, a small floating button appears; clicking it quotes the
 * selection into the composer (via the store's composerDraft).
 */
export function SelectionAsk({ containerRef }: { containerRef: React.RefObject<HTMLElement> }) {
  const [pop, setPop] = useState<PopState | null>(null);
  const setComposerDraft = useKodaStore((s) => s.setComposerDraft);
  const popRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Evaluate the current selection and (re)position the popover. Bound to both
    // mouseup (desktop) and touchend (mobile) so it works with touch selection.
    const evaluate = (target: EventTarget | null) => {
      // Ignore interactions on the popover itself.
      if (popRef.current && target instanceof Node && popRef.current.contains(target)) return;

      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      const container = containerRef.current;
      if (!sel || !text || text.length < 2 || !container) {
        setPop(null);
        return;
      }
      // Only react to selections that live inside the chat container.
      const anchor = sel.anchorNode;
      if (!anchor || !container.contains(anchor)) {
        setPop(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        setPop(null);
        return;
      }
      // Clamp horizontally so the button never spills off a narrow screen.
      const half = 80; // ~half the popover width incl. margin
      const x = Math.max(half, Math.min(window.innerWidth - half, rect.left + rect.width / 2));
      setPop({ text, x, y: rect.top - 8 });
    };

    const onUp = (e: MouseEvent) => evaluate(e.target);
    // Touch selection finalises slightly after touchend — wait a tick.
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.target;
      setTimeout(() => evaluate(t), 50);
    };

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

  if (!pop) return null;

  const ask = () => {
    const quoted = pop.text
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    setComposerDraft(`${quoted}\n\n`);
    setPop(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <button
      ref={popRef}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={ask}
      style={{ left: pop.x, top: pop.y }}
      className="fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border border-koda-border bg-koda-surface px-3 py-1.5 text-xs font-medium text-koda-text shadow-lg transition-colors hover:bg-koda-surface-2"
    >
      <span className="flex items-center gap-1.5">
        <Quote className="h-3.5 w-3.5 text-koda-accent" />
        Ask Koda AI
      </span>
    </button>
  );
}
