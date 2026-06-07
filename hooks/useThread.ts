"use client";

import { useKodaStore } from "@/lib/store";

/** Convenience accessor for a single thread + its CRUD operations. */
export function useThread(threadId: string | null) {
  const thread = useKodaStore((s) =>
    threadId ? s.threads.find((t) => t.id === threadId) : undefined
  );
  const appendMessage = useKodaStore((s) => s.appendMessage);
  const updateMessage = useKodaStore((s) => s.updateMessage);
  const createThread = useKodaStore((s) => s.createThread);
  const deleteThread = useKodaStore((s) => s.deleteThread);
  const setActiveThread = useKodaStore((s) => s.setActiveThread);

  return {
    thread,
    messages: thread?.messages ?? [],
    appendMessage,
    updateMessage,
    createThread,
    deleteThread,
    setActiveThread,
  };
}
