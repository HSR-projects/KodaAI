"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X, FileText, Music, Image as ImageIcon, Library as LibraryIcon } from "lucide-react";
import { useKodaStore } from "@/lib/store";
import { relativeTime } from "@/lib/utils";
import type { Attachment } from "@/types";

interface UploadItem {
  attachment: Attachment;
  threadId: string;
  threadTitle: string;
  at: number;
}

/**
 * Library — a gallery of everything the user has uploaded across their chats
 * (images, audio, files). Click an item to jump to the chat it came from.
 */
export function Library() {
  const router = useRouter();
  const open = useKodaStore((s) => s.libraryOpen);
  const setOpen = useKodaStore((s) => s.setLibraryOpen);
  const threads = useKodaStore((s) => s.threads);

  const items = useMemo<UploadItem[]>(() => {
    const out: UploadItem[] = [];
    for (const t of threads) {
      for (const m of t.messages) {
        for (const a of m.attachments ?? []) {
          out.push({ attachment: a, threadId: t.id, threadTitle: t.title, at: m.createdAt });
        }
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }, [threads]);

  const goto = (threadId: string) => {
    setOpen(false);
    router.push(`/search/${threadId}`);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[8vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-koda-border bg-koda-surface shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-koda-border px-4 py-3">
              <LibraryIcon className="h-4 w-4 text-koda-accent" />
              <p className="text-sm font-medium text-koda-text">Library</p>
              <span className="text-xs text-koda-muted">· {items.length} upload{items.length === 1 ? "" : "s"}</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close library"
                className="ml-auto rounded-md p-1 text-koda-muted hover:bg-koda-surface-2 hover:text-koda-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-3 [scrollbar-width:thin]">
              {items.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-koda-muted">
                  Nothing uploaded yet. Files you attach to chats show up here.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map((it, i) => (
                    <UploadCard key={it.attachment.id + i} item={it} onOpen={() => goto(it.threadId)} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function UploadCard({ item, onOpen }: { item: UploadItem; onOpen: () => void }) {
  const { attachment: a, threadTitle, at } = item;
  const Icon = a.kind === "audio" ? Music : a.kind === "image" ? ImageIcon : FileText;

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${a.name} — from "${threadTitle}"`}
      className="group flex flex-col overflow-hidden rounded-xl border border-koda-border bg-koda-bg text-left transition-colors hover:border-koda-accent/40"
    >
      {a.kind === "image" && a.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.thumbUrl} alt={a.name} className="h-24 w-full object-cover" />
      ) : (
        <div className="flex h-24 w-full items-center justify-center bg-koda-surface-2">
          <Icon className="h-7 w-7 text-koda-muted" />
        </div>
      )}
      <div className="min-w-0 px-2.5 py-2">
        <p className="truncate text-xs text-koda-text">{a.name}</p>
        <p className="truncate text-[10px] text-koda-muted">{relativeTime(at)} · {threadTitle}</p>
      </div>
    </button>
  );
}
