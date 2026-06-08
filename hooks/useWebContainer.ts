"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import type { ProjectFile } from "@/types";

export type WCStatus = "idle" | "booting" | "installing" | "starting" | "ready" | "error";

interface UseWebContainerResult {
  status: WCStatus;
  terminal: string[];
  previewUrl: string | null;
  mount: (files: ProjectFile[], commands: string[]) => Promise<void>;
  reload: () => void;
}

// ── Module-level singleton ──────────────────────────────────────
// WebContainers permits exactly ONE booted instance per page, for the
// whole session. We boot it a single time and reuse that instance across
// every mount of this hook — we NEVER tear it down on unmount (doing so is
// what caused "Only a single WebContainer instance can be booted" when the
// boot/teardown raced under StrictMode or when the panel re-opened).
//
// Subsequent project changes are written into the SAME live instance
// (edit-in-place → Vite HMR) instead of rebooting + reinstalling.
let bootPromise: Promise<WebContainer> | null = null;
let devProcess: WebContainerProcess | null = null;
let installedPkg: string | null = null; // package.json of the running project
let serverUrl: string | null = null;
let offServerReady: (() => void) | null = null;

function bootOnce(): Promise<WebContainer> {
  if (!bootPromise) {
    bootPromise = import("@webcontainer/api")
      .then(({ WebContainer }) => WebContainer.boot())
      .catch((e) => {
        bootPromise = null; // permit a retry after a failed boot
        throw e;
      });
  }
  return bootPromise;
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

function pkgOf(files: ProjectFile[]): string {
  const pkg = files.find((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
  return pkg?.content ?? "";
}

export function useWebContainer(): UseWebContainerResult {
  const [status, setStatus] = useState<WCStatus>(serverUrl ? "ready" : "idle");
  const [terminal, setTerminal] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(serverUrl);
  const wcRef = useRef<WebContainer | null>(null);

  const log = useCallback((line: string) => {
    setTerminal((prev) => [...prev, line]);
  }, []);

  // Boot (or attach to) the singleton WebContainer. No teardown on unmount.
  useEffect(() => {
    let cancelled = false;
    setStatus(serverUrl ? "ready" : "booting");

    bootOnce()
      .then((wc) => {
        if (cancelled) return;
        wcRef.current = wc;
        if (!serverUrl) setStatus("idle");
      })
      .catch((e) => {
        if (cancelled) return;
        log(`Error booting WebContainer: ${(e as Error).message}`);
        setStatus("error");
      });

    return () => { cancelled = true; }; // keep the singleton alive
  }, [log]);

  const mount = useCallback(async (files: ProjectFile[], commands: string[]) => {
    let wc = wcRef.current;
    if (!wc) {
      try { wc = await bootOnce(); wcRef.current = wc; }
      catch { setStatus("error"); return; }
    }
    if (!files.length) return;

    const nextPkg = pkgOf(files);

    // ── Edit-in-place ──────────────────────────────────────────
    // Dev server already running and dependencies unchanged: just write
    // the new files into the LIVE instance and let Vite HMR hot-reload.
    if (devProcess && installedPkg !== null && nextPkg === installedPkg) {
      log("\nkoda@sandbox:~/project$ # applying edits to live VM…");
      try {
        await wc.mount(toFileTree(files) as Parameters<typeof wc.mount>[0]);
        log(`Updated ${files.length} file(s) — hot-reloading.`);
        setStatus("ready");
      } catch (e) {
        log(`Edit failed: ${(e as Error).message}`);
      }
      return;
    }

    // ── Full (re)start ─────────────────────────────────────────
    // First run, or package.json changed → reinstall + restart dev server.
    devProcess?.kill();
    devProcess = null;
    serverUrl = null;
    offServerReady?.();
    offServerReady = null;
    setPreviewUrl(null);
    setTerminal([]);
    setStatus("installing");

    await wc.mount(toFileTree(files) as Parameters<typeof wc.mount>[0]);

    offServerReady = wc.on("server-ready", (_port, url) => {
      serverUrl = url;
      setPreviewUrl(url);
      setStatus("ready");
      log(`\n  ➜  Local:   ${url}`);
    });

    const cmds = commands.length ? commands : ["npm install", "npm run dev"];
    try {
      for (const cmd of cmds) {
        log(`\nkoda@sandbox:~/project$ ${cmd}`);
        const [bin, ...args] = cmd.trim().split(/\s+/);
        const proc = await wc.spawn(bin, args);
        proc.output.pipeTo(new WritableStream({ write: (d) => log(d) }));

        if (/install|^npm i\b|pnpm|yarn/.test(cmd)) {
          setStatus("installing");
          const code = await proc.exit;
          if (code !== 0) {
            log(`\nProcess exited with code ${code}`);
            setStatus("error");
            return;
          }
        } else if (/dev|start|serve|vite/.test(cmd)) {
          setStatus("starting");
          devProcess = proc;
          installedPkg = nextPkg;
          break; // leave the dev server running
        } else {
          await proc.exit;
        }
      }
    } catch (e) {
      log(`\nError: ${(e as Error).message}`);
      setStatus("error");
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
