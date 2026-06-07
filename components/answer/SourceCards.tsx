"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import { useState } from "react";
import type { Source } from "@/types";
import { domainFromUrl, faviconUrl } from "@/lib/utils";

function SourceCard({ source, index }: { source: Source; index: number }) {
  const [imgError, setImgError] = useState(false);
  const domain = domainFromUrl(source.url);

  return (
    <motion.a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="group flex w-56 shrink-0 flex-col gap-2 rounded-xl border border-koda-border bg-koda-surface p-3 transition-colors hover:border-koda-accent/50 hover:bg-koda-surface-2"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-koda-accent/15 text-[11px] font-semibold text-koda-accent-soft">
          {index + 1}
        </span>
        {imgError ? (
          <Globe className="h-4 w-4 text-koda-muted" />
        ) : (
          <Image
            src={faviconUrl(source.url)}
            alt=""
            width={16}
            height={16}
            className="h-4 w-4 rounded-sm"
            onError={() => setImgError(true)}
            unoptimized
          />
        )}
        <span className="truncate text-xs text-koda-muted">{domain}</span>
      </div>
      <p className="line-clamp-2 text-sm font-medium leading-snug text-koda-text group-hover:text-koda-accent-soft">
        {source.title}
      </p>
      {source.snippet && (
        <p className="line-clamp-2 text-xs text-koda-muted">{source.snippet}</p>
      )}
    </motion.a>
  );
}

export function SourceCards({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-koda-muted">
        <Globe className="h-3.5 w-3.5" />
        Sources
        <span className="text-koda-muted/60">· {sources.length}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {sources.map((s, i) => (
          <SourceCard key={`${s.url}-${i}`} source={s} index={i} />
        ))}
      </div>
    </div>
  );
}
