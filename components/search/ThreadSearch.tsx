"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CornerDownLeft, MessageSquare, X } from "lucide-react";
import { useKodaStore } from "@/lib/store";
import { relativeTime, cn } from "@/lib/utils";
import type { Thread } from "@/types";

interface Hit {
  thread: Thread;
  /** A short snippet of the first matching message, if any. */
  snippet?: string;
}

/**
 * macOS-Spotlight-style search for past chats. Centered overlay, opened with
 * ⌘K / Ctrl-K (or the sidebar button), keyboard-navigable, searches both thread
 * titles and message contents.
 */
export function ThreadSearch() {
  const router = useRouter();
  const open = useKodaStore((s) => s.searchOpen);
  const setOpen = useKodaStore((s) => s.setSearchOpen);
  const threads = useKodaStore((s) => s.threads);
  const setActiveThread = useKodaStore((s) => s.setActiveThread);

  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl-K to toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useKodaStore.getState().searchOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Reset + focus when opened.
  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase();
    const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!query) return sorted.slice(0, 12).map((thread) => ({ thread }));
    const out: Hit[] = [];
    for (const thread of sorted) {
      if (thread.title.toLowerCase().includes(query)) {
        out.push({ thread });
        continue;
      }
      const msg = thread.messages.find((m) => m.content?.toLowerCase().includes(query));
      if (msg) {
        const i = msg.content.toLowerCase().indexOf(query);
        const start = Math.max(0, i - 30);
        out.push({
          thread,
          snippet: (start > 0 ? "…" : "") + msg.content.slice(start, i + query.length + 40).trim(),
        });
      }
    }
    return out.slice(0, 20);
  }, [q, threads]);

  useEffect(() => {
    if (active >= hits.length) setActive(0);
  }, [hits.length, active]);

  const go = (thread: Thread) => {
    setActiveThread(thread.id);
    setOpen(false);
    router.push(`/search/${thread.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active].thread);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-koda-border bg-koda-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-koda-border px-4">
              <Search className="h-5 w-5 shrink-0 text-koda-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search your chats…"
                className="flex-1 bg-transparent py-4 text-[15px] text-koda-text placeholder:text-koda-muted focus:outline-none"
              />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="rounded-md p-1 text-koda-muted hover:bg-koda-surface-2 hover:text-koda-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-2 [scrollbar-width:thin]">
              {hits.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-koda-muted">
                  {threads.length === 0 ? "No chats yet." : "No matching chats."}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {hits.map((hit, i) => (
                    <li key={hit.thread.id}>
                      <button
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(hit.thread)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                          i === active ? "bg-koda-surface-2" : "hover:bg-koda-surface-2/60"
                        )}
                      >
                        <MessageSquare className="h-4 w-4 shrink-0 text-koda-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-koda-text">
                            {hit.thread.title}
                          </span>
                          <span className="block truncate text-xs text-koda-muted">
                            {hit.snippet || relativeTime(hit.thread.updatedAt)}
                          </span>
                        </span>
                        {i === active && (
                          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-koda-muted" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-koda-border px-4 py-2 text-[11px] text-koda-muted">
              <span>↑↓ to navigate · ↵ to open · esc to close</span>
              <span>⌘K</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
