"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, Sparkles, FileText, Music } from "lucide-react";
import type { Attachment } from "@/types";
import type { Message } from "@/types";
import { useKodaStore } from "@/lib/store";
import { useModels } from "@/hooks/useModels";
import { useThread } from "@/hooks/useThread";
import { useChat } from "@/hooks/useChat";
import { useAuth } from "@/components/auth/AuthProvider";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { SearchBar } from "@/components/search/SearchBar";
import { AnswerPanel } from "@/components/answer/AnswerPanel";
import { AgentSteps } from "@/components/answer/AgentSteps";
import { SwarmPanel } from "@/components/answer/SwarmPanel";
import { SourceCards } from "@/components/answer/SourceCards";
import { FollowUpChips } from "@/components/answer/FollowUpChips";
import { MessageActions } from "@/components/answer/MessageActions";
import { UserMessage } from "@/components/answer/UserMessage";
import { SelectionAsk } from "@/components/answer/SelectionAsk";
import { ArtifactPanel } from "@/components/artifacts/ArtifactPanel";

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = params?.threadId as string;

  useModels();
  const { caps } = useAuth();
  const {
    focusMode,
    setFocusMode,
    setActiveThread,
    agentMode,
    setAgentMode,
    swarmMode,
    setSwarmMode,
    targetUrl,
    setTargetUrl,
    setPricingOpen,
  } = useKodaStore();
  const { thread, messages } = useThread(threadId);
  const { send, stop, loading, searchWarning } = useChat(threadId);

  const sendOpts = {
    agent: agentMode && caps.agent && !swarmMode,
    agentSteps: caps.agentSteps,
    swarm: swarmMode && caps.swarm,
    swarmAgents: caps.swarmAgents,
    targetUrl: targetUrl || undefined,
    imageGen: caps.imageGen,
    computer: caps.computer,
    slidesMax: caps.slidesMax,
  };

  const onAgentToggle = () => {
    if (!caps.agent) { setPricingOpen(true); return; }
    setAgentMode(!agentMode);
    if (!agentMode) setSwarmMode(false);
  };

  const onSwarmToggle = () => {
    if (!caps.swarm) { setPricingOpen(true); return; }
    setSwarmMode(!swarmMode);
    if (!swarmMode) setAgentMode(false);
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const sentInitial = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Re-send from a given user message (edit) or redo an answer (regenerate):
  // drop that turn and everything after it, then send the (edited) text fresh.
  const resendFrom = (userMessageId: string, text: string) => {
    if (loading) return;
    useKodaStore.getState().deleteMessagesFrom(threadId, userMessageId);
    send(text, sendOpts);
  };

  // Avoid SSR/localStorage hydration mismatch.
  useEffect(() => {
    setMounted(true);
    // Sidebar starts open on desktop, closed on mobile.
    if (typeof window !== "undefined") setSidebarOpen(window.innerWidth >= 768);
  }, []);

  useEffect(() => {
    if (threadId) setActiveThread(threadId);
  }, [threadId, setActiveThread]);

  // A Koda's Computer sandbox is bound to the chat that built it — it is never
  // persisted or shared. Switching threads discards the sandbox entirely.
  useEffect(() => {
    useKodaStore.getState().resetComputer();
    useKodaStore.getState().resetSlides();
    useKodaStore.getState().resetWorkbook();
    useKodaStore.getState().resetWebsite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Auto-send the initial query (?q=) once for a fresh thread.
  useEffect(() => {
    if (!mounted || sentInitial.current) return;
    const q = searchParams.get("q") ?? "";
    const pending = useKodaStore.getState().pendingAttachments;
    if ((q || pending.length) && thread && thread.messages.length === 0) {
      sentInitial.current = true;
      if (pending.length) useKodaStore.getState().setPendingAttachments([]);
      send(q, { ...sendOpts, attachments: pending.length ? pending : undefined });
      // Clean the URL so refresh doesn't re-send.
      router.replace(`/search/${threadId}`);
    } else if (thread && thread.messages.length > 0) {
      sentInitial.current = true;
    }
  }, [mounted, searchParams, thread, send, router, threadId]);

  // Auto-scroll while streaming — only when the user is already near the bottom.
  useEffect(() => {
    const el = bottomRef.current?.closest(".overflow-y-auto") as HTMLElement | null;
    if (!el) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 200) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const notFound = mounted && !thread;

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <Header showMenu onToggleSidebar={() => setSidebarOpen((v) => !v)} title={thread?.title} />

        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 pb-52 sm:pb-40">
            {searchWarning && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {searchWarning}
              </div>
            )}

            {notFound ? (
              <EmptyThread onHome={() => router.push("/")} />
            ) : (
              <div className="space-y-8">
                {pairMessages(messages).map((pair, i) => (
                  <section key={pair.user?.id ?? i} className="space-y-4">
                    {pair.user && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <UserMessage
                          message={pair.user}
                          disabled={loading}
                          onEdit={(text) => resendFrom(pair.user!.id, text)}
                          attachmentsSlot={
                            pair.user.attachments && pair.user.attachments.length > 0 ? (
                              <MessageAttachments attachments={pair.user.attachments} />
                            ) : null
                          }
                        />
                      </motion.div>
                    )}
                    {pair.assistant && (
                      <div className="space-y-3">
                        {pair.assistant.swarmAgents &&
                          pair.assistant.swarmAgents.length > 0 ? (
                            <SwarmPanel agents={pair.assistant.swarmAgents} />
                          ) : pair.assistant.steps &&
                            pair.assistant.steps.length > 0 ? (
                            <AgentSteps steps={pair.assistant.steps} />
                          ) : null}
                        {pair.assistant.sources &&
                          pair.assistant.sources.length > 0 && (
                            <SourceCards sources={pair.assistant.sources} />
                          )}
                        <AnswerPanel message={pair.assistant} />
                        {!pair.assistant.streaming && !pair.assistant.error && (
                          <MessageActions
                            threadId={threadId}
                            message={pair.assistant}
                            onRegenerate={
                              pair.user
                                ? () => resendFrom(pair.user!.id, pair.user!.content)
                                : undefined
                            }
                          />
                        )}
                        {!pair.assistant.streaming &&
                          pair.assistant.followups &&
                          pair.assistant.followups.length > 0 && (
                            <FollowUpChips
                              questions={pair.assistant.followups}
                              onSelect={(q) => send(q, sendOpts)}
                              disabled={loading}
                            />
                          )}
                      </div>
                    )}
                  </section>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </main>

        {/* Sticky follow-up input — scoped to the main column so the artifact
            panel never overlaps it. */}
        {!notFound && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-koda-bg via-koda-bg/90 to-transparent pt-10 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="pointer-events-auto mx-auto max-w-3xl px-4">
              <SearchBar
                focusMode={focusMode}
                onFocusChange={setFocusMode}
                onSubmit={(q, attachments) => send(q, { ...sendOpts, attachments })}
                placeholder="Ask a follow-up…"
                loading={loading}
                onStop={stop}
                showAgent
                agentMode={agentMode}
                agentLocked={!caps.agent}
                onAgentToggle={onAgentToggle}
                showSwarm
                swarmMode={swarmMode}
                swarmLocked={!caps.swarm}
                onSwarmToggle={onSwarmToggle}
                targetUrl={targetUrl}
                onTargetUrlChange={setTargetUrl}
              />
            </div>
          </div>
        )}
      </div>

      <ArtifactPanel />
      <SelectionAsk containerRef={mainRef} />
    </div>
  );
}

function EmptyThread({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Sparkles className="mb-3 h-8 w-8 text-koda-accent" />
      <p className="text-koda-text">This thread doesn&apos;t exist.</p>
      <button
        onClick={onHome}
        className="mt-4 rounded-lg bg-koda-accent px-4 py-2 text-sm font-medium text-black hover:bg-koda-accent-soft"
      >
        Start a new search
      </button>
    </div>
  );
}

/** Render a user message's attachments as thumbnails (images) and chips. */
function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((a) =>
        a.kind === "image" && a.thumbUrl ? (
          <a
            key={a.id}
            href={a.thumbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block h-20 w-20 overflow-hidden rounded-lg border border-koda-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.thumbUrl} alt={a.name} className="h-full w-full object-cover" />
          </a>
        ) : (
          <span
            key={a.id}
            className="inline-flex max-w-[200px] items-center gap-1.5 rounded-lg border border-koda-border bg-koda-surface px-2.5 py-1.5 text-xs text-koda-muted"
          >
            {a.kind === "audio" ? (
              <Music className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{a.name}</span>
          </span>
        )
      )}
    </div>
  );
}

/** Group the flat message list into [user, assistant] pairs for rendering. */
function pairMessages(messages: Message[]) {
  const pairs: { user?: Message; assistant?: Message }[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      pairs.push({ user: m });
    } else if (m.role === "assistant") {
      const last = pairs[pairs.length - 1];
      if (last && !last.assistant) last.assistant = m;
      else pairs.push({ assistant: m });
    }
  }
  return pairs;
}
