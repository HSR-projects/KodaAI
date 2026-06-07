import { spawn } from "node:child_process";

/**
 * Thin UCI wrapper around a local Stockfish binary.
 *
 * This module is intentionally generic ("chess engine") — nothing here, nor any
 * response it produces, names the engine. The assistant must never reveal which
 * engine backs its play.
 */
export const ENGINE_PATH =
  process.env.STOCKFISH_PATH || "/opt/homebrew/bin/stockfish";

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

export interface BestMove {
  /** UCI string, e.g. "e2e4" or "e7e8q". */
  uci: string;
  from: string;
  to: string;
  promotion?: string;
}

interface EngineOptions {
  /** 0 (weakest) … 20 (full strength). */
  skill?: number;
  /** Thinking budget in milliseconds. */
  movetimeMs?: number;
}

/**
 * Ask the engine for its best move from a FEN position.
 * Spawns a fresh, short-lived process per call — stateless and robust.
 */
export function bestMove(
  fen: string,
  { skill = 8, movetimeMs = 600 }: EngineOptions = {}
): Promise<BestMove> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(ENGINE_PATH, [], { stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      reject(new EngineError("Chess engine is unavailable."));
      return;
    }

    const clampedSkill = Math.max(0, Math.min(20, Math.round(skill)));
    let buffer = "";
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.write("quit\n");
      } catch {
        /* already gone */
      }
      child.kill();
      fn();
    };

    const timer = setTimeout(
      () => finish(() => reject(new EngineError("Engine timed out."))),
      Math.max(3000, movetimeMs + 4000)
    );

    child.on("error", () =>
      finish(() => reject(new EngineError("Chess engine failed to start.")))
    );

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);

        if (line.startsWith("bestmove")) {
          const uci = line.split(/\s+/)[1] ?? "";
          if (!uci || uci === "(none)") {
            finish(() => reject(new EngineError("No legal move available.")));
            return;
          }
          finish(() =>
            resolve({
              uci,
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci.length > 4 ? uci.slice(4) : undefined,
            })
          );
          return;
        }
      }
    });

    // UCI handshake → configure → search.
    const cmds = [
      "uci",
      "setoption name Skill Level value " + clampedSkill,
      "ucinewgame",
      "position fen " + fen,
      "go movetime " + Math.max(50, Math.round(movetimeMs)),
      "",
    ].join("\n");

    try {
      child.stdin.write(cmds);
    } catch {
      finish(() => reject(new EngineError("Could not talk to the engine.")));
    }
  });
}
