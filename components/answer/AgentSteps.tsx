"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Loader2,
  Minus,
  Sparkles,
  X,
} from "lucide-react";
import type { AgentStep, StepStatus } from "@/types";
import { cn } from "@/lib/utils";

function StatusDot({ status }: { status: StepStatus }) {
  switch (status) {
    case "active":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-koda-accent" />;
    case "done":
      return <Check className="h-3.5 w-3.5 text-emerald-400" />;
    case "skipped":
      return <Minus className="h-3.5 w-3.5 text-koda-muted" />;
    case "error":
      return <X className="h-3.5 w-3.5 text-red-400" />;
  }
}

/**
 * Compact, collapsible "agent trace" shown above an answer — the Perplexity-style
 * pro-search timeline (understanding → search/skip → reading → writing).
 */
export function AgentSteps({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(true);
  if (!steps.length) return null;

  const active = steps.some((s) => s.status === "active");
  const summary = active
    ? steps.find((s) => s.status === "active")?.label ?? "Working…"
    : "Steps";

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-koda-border bg-koda-surface/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-koda-muted transition-colors hover:text-koda-text"
      >
        {active ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-koda-accent" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-koda-accent" />
        )}
        <span className="text-koda-text/80">{summary}</span>
        <span className="text-koda-muted/60">· {steps.length} steps</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-1 px-3 pb-2.5"
          >
            {steps.map((step) => (
              <li
                key={step.id}
                className="flex items-center gap-2.5 text-xs"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <StatusDot status={step.status} />
                </span>
                <span
                  className={cn(
                    step.status === "skipped"
                      ? "text-koda-muted"
                      : "text-koda-text/90"
                  )}
                >
                  {step.label}
                </span>
                {step.detail && (
                  <span className="truncate text-koda-muted/70">
                    — {step.detail}
                  </span>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
