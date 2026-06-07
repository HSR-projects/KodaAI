"use client";

import type { Source } from "@/types";
import { domainFromUrl } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CitationBadgeProps {
  index: number;
  source?: Source;
}

/** Inline [n] badge that links to its source and shows a hover preview. */
export function CitationBadge({ index, source }: CitationBadgeProps) {
  const badge = (
    <span className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-koda-accent/15 px-1 align-middle text-[11px] font-semibold text-koda-accent-soft ring-1 ring-koda-accent/30 transition-colors hover:bg-koda-accent/25">
      {index}
    </span>
  );

  if (!source?.url) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Source ${index}: ${source.title}`}
        >
          {badge}
        </a>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium text-koda-text line-clamp-2">{source.title}</p>
        <p className="mt-0.5 text-koda-muted">{domainFromUrl(source.url)}</p>
      </TooltipContent>
    </Tooltip>
  );
}
