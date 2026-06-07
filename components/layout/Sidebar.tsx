"use client";

import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, MessageSquare, Trash2, X, Search, Library as LibraryIcon } from "lucide-react";
import { useKodaStore } from "@/lib/store";
import { ThreadSearch } from "@/components/search/ThreadSearch";
import { Library } from "@/components/layout/Library";
import { relativeTime, cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const router = useRouter();
  const params = useParams();
  const activeId = (params?.threadId as string) ?? null;
  const { threads, deleteThread, setActiveThread } = useKodaStore();
  const setSearchOpen = useKodaStore((s) => s.setSearchOpen);
  const setLibraryOpen = useKodaStore((s) => s.setLibraryOpen);

  const openThread = (id: string) => {
    setActiveThread(id);
    router.push(`/search/${id}`);
    onClose();
  };

  const newSearch = () => {
    setActiveThread(null);
    router.push("/");
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-koda-border bg-koda-surface transition-transform md:static md:z-auto",
          // Open: visible everywhere. Closed: off-canvas on mobile, removed from
          // the layout on desktop so the chat expands full-width.
          open ? "translate-x-0 md:flex" : "-translate-x-full md:hidden"
        )}
      >
        <div className="flex items-center justify-between p-3">
          <button
            onClick={newSearch}
            className="flex flex-1 items-center gap-2 rounded-xl border border-koda-border bg-koda-bg px-3 py-2.5 text-sm font-medium text-koda-text transition-colors hover:border-koda-accent/40 hover:bg-koda-surface-2"
          >
            <Plus className="h-4 w-4 text-koda-accent" />
            New Search
          </button>
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-koda-muted hover:bg-koda-surface-2 md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search chats — opens the Spotlight-style palette (⌘K). */}
        <div className="px-3 pb-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-koda-border bg-koda-bg px-3 py-2 text-sm text-koda-muted transition-colors hover:border-koda-accent/40 hover:bg-koda-surface-2 hover:text-koda-text"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search chats</span>
            <span className="rounded border border-koda-border px-1.5 py-0.5 text-[10px] text-koda-muted">⌘K</span>
          </button>
          <button
            onClick={() => setLibraryOpen(true)}
            className="mt-1.5 flex w-full items-center gap-2 rounded-xl border border-koda-border bg-koda-bg px-3 py-2 text-sm text-koda-muted transition-colors hover:border-koda-accent/40 hover:bg-koda-surface-2 hover:text-koda-text"
          >
            <LibraryIcon className="h-4 w-4" />
            <span className="flex-1 text-left">Library</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:thin]">
          {threads.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-koda-muted">
              No threads yet. Start a search to begin.
            </p>
          ) : (
            <ul className="space-y-1">
              {threads.map((t, i) => {
                const active = t.id === activeId;
                return (
                  <motion.li
                    key={t.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  >
                    <div
                      className={cn(
                        "group relative flex cursor-pointer items-start gap-2 rounded-lg border-l-2 px-3 py-2.5 transition-colors",
                        active
                          ? "border-koda-accent bg-koda-surface-2"
                          : "border-transparent hover:bg-koda-surface-2"
                      )}
                      onClick={() => openThread(t.id)}
                    >
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-koda-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-koda-text">{t.title}</p>
                        <p className="text-xs text-koda-muted">
                          {relativeTime(t.updatedAt)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteThread(t.id);
                          fetch(`/api/threads/${t.id}`, { method: "DELETE" }).catch(() => {});
                          if (active) newSearch();
                        }}
                        aria-label="Delete thread"
                        className="shrink-0 p-1 opacity-100 transition-opacity hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4 text-koda-muted hover:text-red-400" />
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-koda-border p-3 text-[11px] text-koda-muted">
          Powered by Koda AI · Privacy-first
        </div>
      </aside>

      <ThreadSearch />
      <Library />
    </>
  );
}
