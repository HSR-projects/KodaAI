"use client";

import { Globe, MessageSquare, Code2, GraduationCap } from "lucide-react";
import type { FocusMode } from "@/types";
import { cn } from "@/lib/utils";

const MODES: { id: FocusMode; label: string; icon: typeof Globe; hint: string }[] = [
  { id: "all", label: "Auto", icon: Globe, hint: "Searches the web only when needed" },
  { id: "nosearch", label: "No Search", icon: MessageSquare, hint: "Pure local LLM" },
  { id: "code", label: "Code", icon: Code2, hint: "Tuned for programming" },
  { id: "academic", label: "Academic", icon: GraduationCap, hint: "Structured, cited" },
];

interface FocusModesProps {
  value: FocusMode;
  onChange: (m: FocusMode) => void;
}

export function FocusModes({ value, onChange }: FocusModesProps) {
  return (
    <div
      role="tablist"
      aria-label="Focus mode"
      className="flex flex-wrap items-center gap-1.5"
    >
      {MODES.map(({ id, label, icon: Icon, hint }) => {
        const active = value === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            title={hint}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-koda-accent/50 bg-koda-accent/15 text-koda-accent-soft"
                : "border-koda-border bg-koda-surface text-koda-muted hover:border-koda-border hover:bg-koda-surface-2 hover:text-koda-text"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {active && (
              <span className="h-1.5 w-1.5 rounded-full bg-koda-accent" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}
