"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "Latest breakthroughs in AI",
  "Explain RAG in simple terms",
  "How do local LLMs compare to cloud models?",
  "Best practices for prompt engineering",
  "What is vector search?",
];

export function SuggestedQueries({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="flex flex-wrap items-center justify-center gap-2"
    >
      <span className="inline-flex items-center gap-1 text-xs text-koda-muted">
        <Sparkles className="h-3.5 w-3.5" /> Try
      </span>
      {SUGGESTIONS.map((s, i) => (
        <motion.button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 + i * 0.05 }}
          className="rounded-full border border-koda-border bg-koda-surface px-3 py-1.5 text-xs text-koda-muted transition-colors hover:border-koda-accent/40 hover:bg-koda-surface-2 hover:text-koda-text"
        >
          {s}
        </motion.button>
      ))}
    </motion.div>
  );
}
