"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WebContainerProcess } from "@webcontainer/api";
import type { ProjectFile } from "@/types";

export type WCStatus = "idle" | "booting" | "installing" | "starting" | "ready" | "error";

interface UseWebContainerResult {
  status: WCStatus;
  terminal: string[];
  previewUrl: string | null;
  mount: (files: ProjectFile[], commands: string[]) => Promise<void>;
  reload: () => void;
}

/** Convert ProjectFile[] flat list into the WebContainer FileSystemTree format. */
function toFileTree(files: ProjectFile[]): Record<string, unknown> {
  const tree: Record<string, unknown> = {};

  for (const f of files) {
    const parts = f.path.replace(/^\.?\/+/, "").split("/");
    let node = tree;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = { file: { contents: f.content } };
      } else {
        if (!node[part] || typeof node[part] !== "object" || !("directory" in (node[part] as object))) {
          node[part] = { directory: {} };
        }
        node = (node[part] as { directory: Record<string, unknown> }).directory;
      }
    });
  }

  return tree;
}

export function useWebContainer(): UseWebContainerResult {
  const [status, setStatus] = useState<WCStatus>("idle");
  const [terminal, setTerminal] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const wcRef = useRef<import("@webcontainer/api").WebContainer | null>(null);
  const devProcessRef = useRef<WebContainerProcess | null>(null);
  const mountedRef = useRef(false);

  const log = useCallback((line: string) => {
    setTerminal((prev) => [...prev, line]);
  }, []);

  // Boot the WebContainer once — it persists for the lifetime of this component.
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setStatus("booting");
      try {
        const { WebContainer } = await import("@webcontainer/api");
        const wc = await WebContainer.boot();
        if (cancelled) { wc.teardown(); return; }
        wcRef.current = wc;
        mountedRef.current = false;
        log("WebContainer ready.");
        setStatus("idle");
      } catch (e) {
        if (!cancelled) {
          log(`Error booting WebContainer: ${(e as Error).message}`);
          setStatus("error");
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
      wcRef.current?.teardown();
      wcRef.current = null;
    };
  }, [log]);

  const mount = useCallback(async (files: ProjectFile[], commands: string[]) => {
    const wc = wcRef.current;
    if (!wc || !files.length) return;

    // Kill any previous dev server
    devProcessRef.current?.kill();
    devProcessRef.current = null;
    setPreviewUrl(null);
    setTerminal([]);

    setStatus("installing");
    log(`koda@sandbox:~/project$ ls`);
    log(files.map((f) => f.path.split("/")[0]).filter((v, i, a) => a.indexOf(v) === i).join("  "));

    // Mount files
    await wc.mount(toFileTree(files) as Parameters<typeof wc.mount>[0]);

    // Run commands
    const cmds = commands.length ? commands : ["npm install", "npm run dev"];

    for (const cmd of cmds) {
      log(`\nkoda@sandbox:~/project$ ${cmd}`);
      const [bin, ...args] = cmd.trim().split(/\s+/);
      const process = await wc.spawn(bin, args);

      process.output.pipeTo(
        new WritableStream({
          write(data) { log(data); },
        })
      );

      if (/install|^npm i\b|pnpm|yarn/.test(cmd)) {
        setStatus("installing");
        const code = await process.exit;
        if (code !== 0) {
          log(`\nProcess exited with code ${code}`);
          setStatus("error");
          return;
        }
      } else if (/dev|start|serve|vite/.test(cmd)) {
        setStatus("starting");
        devProcessRef.current = process;
        // Don't await — dev server runs until killed
        wc.on("server-ready", (port, url) => {
          log(`\n  ➜  Local:   ${url}`);
          setPreviewUrl(url);
          setStatus("ready");
        });
        break; // Leave dev server running
      } else {
        await process.exit;
      }
    }
  }, [log]);

  const reload = useCallback(() => {
    setPreviewUrl((url) => {
      if (!url) return url;
      const u = new URL(url);
      u.searchParams.set("_r", Date.now().toString());
      return u.toString();
    });
  }, []);

  return { status, terminal, previewUrl, mount, reload };
}
