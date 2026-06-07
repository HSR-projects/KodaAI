"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { Loader2, X, Puzzle, MonitorPlay, Presentation, FileSpreadsheet, Globe } from "lucide-react";
import type { ArtifactType } from "@/types";
import { useKodaStore } from "@/lib/store";

// Remember the user's chosen panel width per artifact type for this session
// (module scope survives the panel unmounting/remounting between opens).
const sessionWidths: Partial<Record<ArtifactType, number>> = {};

function defaultWidth(type: ArtifactType): number {
  return type === "computer" || type === "website" ? 820 : 560;
}

// Board library touches the DOM — load it client-side only.
const ChessArtifact = dynamic(
  () => import("./ChessArtifact").then((m) => m.ChessArtifact),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-koda-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ),
  }
);

// Sandbox renders an iframe + Babel — client-only.
const ComputerArtifact = dynamic(
  () => import("./ComputerArtifact").then((m) => m.ComputerArtifact),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-koda-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ),
  }
);

// Slides panel loads pptxgenjs lazily — client-only.
const SlidesArtifact = dynamic(
  () => import("./SlidesArtifact").then((m) => m.SlidesArtifact),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-koda-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ),
  }
);

// Spreadsheet panel — client-only.
const SheetArtifact = dynamic(
  () => import("./SheetArtifact").then((m) => m.SheetArtifact),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-koda-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ),
  }
);

// Website builder panel — client-only.
const WebsiteArtifact = dynamic(
  () => import("./WebsiteArtifact").then((m) => m.WebsiteArtifact),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-koda-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ),
  }
);

/**
 * Claude-style artifact side panel. Slides in from the right on desktop and
 * covers the screen on mobile. Renders whatever artifact is active in the store.
 */
export function ArtifactPanel() {
  const artifact = useKodaStore((s) => s.artifact);
  const close = useKodaStore((s) => s.closeArtifact);

  const [isDesktop, setIsDesktop] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  // Track desktop breakpoint — resizing only applies on md+ (mobile is full-screen).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Initialise width from this session's remembered value (or the type default).
  useEffect(() => {
    if (!artifact) return;
    setWidth(sessionWidths[artifact.type] ?? defaultWidth(artifact.type));
  }, [artifact?.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      if (!isDesktop || !artifact) return;
      e.preventDefault();
      const type = artifact.type;
      const startX = e.clientX;
      const startW =
        asideRef.current?.getBoundingClientRect().width ??
        width ??
        defaultWidth(type);
      setDragging(true);

      const onMove = (ev: PointerEvent) => {
        const min = 420;
        const max = Math.min(window.innerWidth - 360, 1400);
        // Panel is anchored right: dragging the left edge leftward widens it.
        const next = Math.max(min, Math.min(max, startW + (startX - ev.clientX)));
        setWidth(next);
        sessionWidths[type] = next;
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [isDesktop, artifact, width]
  );

  return (
    <AnimatePresence>
      {artifact && (
        <motion.aside
          ref={asideRef}
          key="artifact"
          initial={{ x: "100%", opacity: 0.4 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0.4 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          style={isDesktop && width ? { width } : undefined}
          className="absolute inset-0 z-30 flex w-full flex-col border-l border-koda-border bg-koda-bg md:relative md:inset-auto md:z-auto"
        >
          {/* Resize handle — desktop only. */}
          {isDesktop && (
            <div
              onPointerDown={startResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
              className="group absolute left-0 top-0 z-40 flex h-full w-2 -translate-x-1/2 cursor-col-resize items-center justify-center"
            >
              <span
                className={
                  "h-full w-px transition-colors " +
                  (dragging
                    ? "bg-koda-accent"
                    : "bg-transparent group-hover:bg-koda-accent/50")
                }
              />
            </div>
          )}

          {/* While dragging, this overlay keeps pointer events off the iframe. */}
          {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}

          <header className="flex items-center gap-2 border-b border-koda-border px-4 py-3">
            {artifact.type === "computer" ? (
              <MonitorPlay className="h-4 w-4 text-koda-accent" />
            ) : artifact.type === "slides" ? (
              <Presentation className="h-4 w-4 text-koda-accent" />
            ) : artifact.type === "sheet" ? (
              <FileSpreadsheet className="h-4 w-4 text-koda-accent" />
            ) : artifact.type === "website" ? (
              <Globe className="h-4 w-4 text-koda-accent" />
            ) : (
              <Puzzle className="h-4 w-4 text-koda-accent" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-koda-text">
                {artifact.title}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-koda-muted">
                {artifact.type === "chess"
                  ? "Interactive · Chess"
                  : artifact.type === "computer"
                  ? "Koda's Computer · Sandbox"
                  : artifact.type === "slides"
                  ? "Presentation · Slides"
                  : artifact.type === "sheet"
                  ? "Spreadsheet · Excel"
                  : artifact.type === "website"
                  ? "Website · Static site"
                  : "Artifact"}
              </p>
            </div>
            <button
              onClick={close}
              aria-label="Close artifact"
              className="ml-auto rounded-lg p-1.5 text-koda-muted transition-colors hover:bg-koda-surface-2 hover:text-koda-text"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {artifact.type === "computer" ? (
            <div className="flex-1 overflow-hidden">
              <ComputerArtifact />
            </div>
          ) : artifact.type === "slides" ? (
            <div className="flex-1 overflow-hidden">
              <SlidesArtifact />
            </div>
          ) : artifact.type === "sheet" ? (
            <div className="flex-1 overflow-hidden">
              <SheetArtifact />
            </div>
          ) : artifact.type === "website" ? (
            <div className="flex-1 overflow-hidden">
              <WebsiteArtifact />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              {artifact.type === "chess" ? (
                <ChessArtifact
                  key={artifact.title}
                  playerColor={artifact.playerColor}
                />
              ) : (
                <iframe
                  title={artifact.title}
                  sandbox="allow-scripts allow-modals"
                  className="h-full min-h-[480px] w-full rounded-lg bg-white"
                  srcDoc={artifact.code}
                />
              )}
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
