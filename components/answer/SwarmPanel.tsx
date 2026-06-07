"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Brain,
  Newspaper,
  Sparkles,
  ChevronDown,
  Loader2,
  Check,
  X,
  Network,
} from "lucide-react";
import type { SwarmAgentRole, SwarmAgentRun, SwarmAgentStatus } from "@/types";
import { cn } from "@/lib/utils";

function RoleIcon({ role, className }: { role: SwarmAgentRole; className?: string }) {
  const cls = cn("h-4 w-4 shrink-0", className);
  switch (role) {
    case "researcher":  return <Search className={cls} />;
    case "analyst":     return <Brain className={cls} />;
    case "critic":      return <Newspaper className={cls} />;
    case "synthesizer": return <Sparkles className={cls} />;
  }
}

function roleTextColor(role: SwarmAgentRole) {
  switch (role) {
    case "researcher":  return "text-blue-400";
    case "analyst":     return "text-violet-400";
    case "critic":      return "text-amber-400";
    case "synthesizer": return "text-koda-accent";
  }
}

function roleBorderActive(role: SwarmAgentRole) {
  switch (role) {
    case "researcher":  return "border-blue-500/50";
    case "analyst":     return "border-violet-500/50";
    case "critic":      return "border-amber-500/50";
    case "synthesizer": return "border-koda-accent/50";
  }
}

function StatusIcon({ status }: { status: SwarmAgentStatus }) {
  switch (status) {
    case "pending":  return <span className="h-2 w-2 rounded-full bg-koda-border/50" />;
    case "thinking": return <Loader2 className="h-3.5 w-3.5 animate-spin text-koda-accent" />;
    case "done":     return <Check className="h-3.5 w-3.5 text-emerald-400" />;
    case "error":    return <X className="h-3.5 w-3.5 text-red-400" />;
  }
}

function AgentCard({ agent }: { agent: SwarmAgentRun }) {
  const isStreaming = agent.status === "thinking" && !!agent.output;
  const isDone = agent.status === "done";
  const [expanded, setExpanded] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the card's own output area while streaming.
  useEffect(() => {
    if (isStreaming && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [isStreaming, agent.output]);

  const long = isDone && !!agent.output && agent.output.length > 300;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-koda-surface/50 px-3.5 py-3 text-xs",
        (isStreaming || agent.status === "thinking")
          ? roleBorderActive(agent.role)
          : "border-koda-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <RoleIcon role={agent.role} className={roleTextColor(agent.role)} />
        <span className={cn("font-semibold", roleTextColor(agent.role))}>
          {agent.label}
        </span>
        {agent.sourceCount !== undefined && agent.sourceCount > 0 && (
          <span className="rounded-full bg-koda-surface-2 px-1.5 py-0.5 text-[10px] text-koda-muted/70">
            {agent.sourceCount} srcs
          </span>
        )}
        <div className="ml-auto flex-shrink-0">
          <StatusIcon status={agent.status} />
        </div>
      </div>

      {/* Streaming output — capped height with its own scroll */}
      {isStreaming && (
        <div
          ref={outputRef}
          className="max-h-40 overflow-y-auto leading-relaxed text-koda-text/75 scrollbar-thin"
        >
          {agent.output}
          <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-koda-accent align-middle" />
        </div>
      )}

      {/* Done output — collapsed or expanded */}
      {isDone && agent.output && (
        <>
          <p className={cn("leading-relaxed text-koda-text/80", !expanded && long && "line-clamp-4")}>
            {agent.output}
          </p>
          {long && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="self-start text-koda-accent/70 transition-colors hover:text-koda-accent"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </>
      )}

      {/* Pending */}
      {agent.status === "pending" && (
        <p className="text-koda-muted/40 italic">Waiting…</p>
      )}
    </div>
  );
}

export function SwarmPanel({ agents }: { agents: SwarmAgentRun[] }) {
  const [open, setOpen] = useState(true);
  if (!agents.length) return null;

  const thinking = agents.filter((a) => a.status === "thinking").length;
  const done = agents.filter((a) => a.status === "done").length;
  const allDone = done === agents.length;

  const specialists = agents.filter((a) => a.role !== "synthesizer");
  const synthesizer = agents.find((a) => a.role === "synthesizer");

  return (
    <div className="mb-4 rounded-xl border border-koda-border bg-koda-surface/40">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs font-medium transition-colors hover:bg-koda-surface/60 rounded-xl"
      >
        {thinking > 0 ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-koda-accent" />
        ) : allDone ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Network className="h-3.5 w-3.5 text-koda-accent" />
        )}
        <span className="font-semibold text-koda-text/90">
          {allDone ? "Swarm complete" : thinking > 0 ? "Agent Swarm running…" : "Agent Swarm"}
        </span>
        <span className="text-koda-muted/60">{done}/{agents.length} done</span>
        <ChevronDown
          className={cn("ml-auto h-3.5 w-3.5 text-koda-muted transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: "hidden" }}
          >
            <div className="space-y-2.5 px-4 pb-4">
              {/* Specialist grid */}
              <div className={cn(
                "grid gap-2.5",
                specialists.length >= 2 ? "sm:grid-cols-2" : "grid-cols-1"
              )}>
                {specialists.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>

              {/* Synthesizer — full width */}
              {synthesizer && <AgentCard agent={synthesizer} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
