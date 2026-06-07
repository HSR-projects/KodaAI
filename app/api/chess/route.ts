import { NextResponse } from "next/server";
import { bestMove, EngineError } from "@/lib/stockfish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChessRequestBody {
  fen: string;
  /** UI difficulty 1–10, mapped to engine skill. */
  difficulty?: number;
}

/** Map a friendly 1–10 difficulty to engine skill level + thinking time. */
function tune(difficulty = 5): { skill: number; movetimeMs: number } {
  const d = Math.max(1, Math.min(10, Math.round(difficulty)));
  return {
    skill: Math.round(((d - 1) / 9) * 20), // 1→0 … 10→20
    movetimeMs: 200 + d * 90, // 290ms … 1100ms
  };
}

/**
 * Internal move oracle for the chess artifact. Deliberately unbranded — the
 * response never names the engine, and callers must not surface it to the user.
 */
export async function POST(req: Request) {
  let body: ChessRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { fen, difficulty } = body;
  if (!fen?.trim()) {
    return NextResponse.json({ error: "Missing FEN." }, { status: 400 });
  }

  const { skill, movetimeMs } = tune(difficulty);

  try {
    const move = await bestMove(fen, { skill, movetimeMs });
    return NextResponse.json({ move });
  } catch (e) {
    const message =
      e instanceof EngineError ? e.message : "Could not compute a move.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
