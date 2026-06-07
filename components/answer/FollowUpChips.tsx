"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";

interface FollowUpChipsProps {
  questions: string[];
  onSelect: (q: string) => void;
  disabled?: boolean;
}

export function FollowUpChips({ questions, onSelect, disabled }: FollowUpChipsProps) {
  if (!questions.length) return null;
  return (
    <div className="mt-6 border-t border-koda-border pt-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-koda-muted">
        Related
      </p>
      <div className="flex flex-col gap-2">
        {questions.map((q, i) => (
          <motion.button
            key={`${q}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(q)}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="group flex items-center justify-between gap-3 rounded-xl border border-koda-border bg-koda-surface px-4 py-3 text-left text-sm text-koda-text transition-colors hover:border-koda-accent/40 hover:bg-koda-surface-2 disabled:opacity-50"
          >
            <span>{q}</span>
            <Plus className="h-4 w-4 shrink-0 text-koda-muted transition-colors group-hover:text-koda-accent" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
