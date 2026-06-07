"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  Bot,
  Clock,
  Loader2,
  RotateCcw,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
  Mic2,
} from "lucide-react";
import type { PlayerColor } from "@/types";
import { useKodaStore } from "@/lib/store";
import { useAuth } from "@/components/auth/AuthProvider";
import { chessSounds } from "@/lib/chessSounds";
import { cn } from "@/lib/utils";

// ── Piece helpers ─────────────────────────────────────────────

const PIECE_SYMBOL: Record<string, { w: string; b: string }> = {
  q: { w: "♕", b: "♛" },
  r: { w: "♖", b: "♜" },
  b: { w: "♗", b: "♝" },
  n: { w: "♘", b: "♞" },
  p: { w: "♙", b: "♟" },
};

const PIECE_VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };

function getCaptured(game: Chess): { byWhite: string[]; byBlack: string[] } {
  const byWhite: string[] = []; // black pieces taken by white
  const byBlack: string[] = []; // white pieces taken by black
  for (const m of game.history({ verbose: true })) {
    if (!m.captured) continue;
    if (m.color === "w") byWhite.push(m.captured);
    else byBlack.push(m.captured);
  }
  return { byWhite, byBlack };
}

function materialScore(pieces: string[]): number {
  return pieces.reduce((s, p) => s + (PIECE_VALUE[p] ?? 0), 0);
}

function CapturedRow({
  pieces,
  color,
  advantage,
}: {
  pieces: string[];
  color: "w" | "b";
  advantage: number;
}) {
  if (!pieces.length) return null;
  const sorted = [...pieces].sort(
    (a, b) => (PIECE_VALUE[b] ?? 0) - (PIECE_VALUE[a] ?? 0)
  );
  return (
    <div className="flex items-center gap-1 text-sm leading-none">
      <span className="mr-0.5 text-xs text-koda-muted">
        {color === "w" ? "W" : "B"}:
      </span>
      {sorted.map((p, i) => (
        <span key={i} className="text-base leading-none opacity-80">
          {color === "w" ? PIECE_SYMBOL[p]?.b : PIECE_SYMBOL[p]?.w}
        </span>
      ))}
      {advantage > 0 && (
        <span className="ml-1 text-xs font-medium text-koda-accent-soft">
          +{advantage}
        </span>
      )}
    </div>
  );
}

const LIGHT = "#ebecd0";
const DARK = "#739552";
const SELECTED_COLOR = "rgba(255, 215, 0, 0.55)";
const VALID_MOVE_COLOR = "rgba(0, 200, 100, 0.35)";
const colorLetter = (c: PlayerColor) => (c === "white" ? "w" : "b");

const TIME_CONTROLS = [
  { id: "unlimited", label: "∞", initial: 0, inc: 0 },
  { id: "bullet", label: "1+0", initial: 60, inc: 0 },
  { id: "blitz", label: "3+2", initial: 180, inc: 2 },
  { id: "rapid", label: "10+0", initial: 600, inc: 0 },
] as const;
type TCId = (typeof TIME_CONTROLS)[number]["id"];

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function ChessArtifact({ playerColor }: { playerColor: PlayerColor }) {
  const { caps } = useAuth();
  const difficulty = Math.min(
    useKodaStore((s) => s.chessDifficulty),
    caps.chessMax
  );
  const pendingMove = useKodaStore((s) => s.pendingChessMove);
  const setPendingChessMove = useKodaStore((s) => s.setPendingChessMove);
  const setChessFen = useKodaStore((s) => s.setChessFen);

  const gameRef = useRef(new Chess());
  const busyRef = useRef(false);
  const endedRef = useRef(false);

  const [orientation, setOrientation] = useState<PlayerColor>(playerColor);
  const [humanColor, setHumanColor] = useState<PlayerColor>(playerColor);
  const [fen, setFen] = useState(gameRef.current.fen());
  const [thinking, setThinking] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Your move.");
  const [history, setHistory] = useState<string[]>([]);
  const [captured, setCaptured] = useState<{ byWhite: string[]; byBlack: string[] }>({ byWhite: [], byBlack: [] });

  // Click-to-move state
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [validMoveSquares, setValidMoveSquares] = useState<Square[]>([]);

  // Commentary state
  const [commentary, setCommentary] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ san: string; color: string; num: number } | null>(null);

  // Clock
  const [tcId, setTcId] = useState<TCId>("unlimited");
  const tc = TIME_CONTROLS.find((t) => t.id === tcId)!;
  const [whiteMs, setWhiteMs] = useState(0);
  const [blackMs, setBlackMs] = useState(0);
  const [started, setStarted] = useState(false);

  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const play = useCallback((name: keyof typeof chessSounds) => {
    if (!mutedRef.current) chessSounds[name]();
  }, []);

  // Responsive board sizing
  const wrapRef = useRef<HTMLDivElement>(null);
  const [boardW, setBoardW] = useState(360);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBoardW(Math.max(240, Math.min(el.clientWidth, 440)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sync = useCallback(() => {
    const g = gameRef.current;
    const currentFen = g.fen();
    setFen(currentFen);
    setChessFen(currentFen);
    setHistory(g.history());
    setCaptured(getCaptured(g));
    if (g.isCheckmate()) {
      const winner = g.turn() === "w" ? "Black" : "White";
      setStatus(`Checkmate — ${winner} wins! 🏆`);
    } else if (g.isStalemate()) setStatus("Stalemate — draw.");
    else if (g.isInsufficientMaterial()) setStatus("Draw — insufficient material.");
    else if (g.isDraw()) setStatus("Draw.");
    else if (g.isCheck()) setStatus("Check!");
    else setStatus(g.turn() === "w" ? "White to move." : "Black to move.");
  }, [setChessFen]);

  const afterMove = useCallback(
    (move: Move) => {
      const g = gameRef.current;
      setSelectedSquare(null);
      setValidMoveSquares([]);

      if (g.isCheckmate()) {
        endedRef.current = true;
        const humanWon = move.color === colorLetter(humanColor);
        play(humanWon ? "win" : "lose");
      } else if (g.isGameOver()) {
        endedRef.current = true;
        play("lose");
      } else if (g.isCheck()) {
        play("check");
      } else if (move.flags.includes("k") || move.flags.includes("q")) {
        play("castle");
      } else if (move.captured) {
        play("capture");
      } else {
        play("move");
      }

      if (tc.inc > 0) {
        if (move.color === "w") setWhiteMs((m) => m + tc.inc * 1000);
        else setBlackMs((m) => m + tc.inc * 1000);
      }
      if (!started) setStarted(true);

      // Trigger commentary fetch
      setLastMove({ san: move.san, color: move.color, num: g.history().length });

      sync();
    },
    [humanColor, play, sync, tc.inc, started]
  );

  // Fetch AI commentary whenever lastMove changes
  useEffect(() => {
    if (!lastMove) return;
    let cancelled = false;
    const side = lastMove.color === "w" ? "White" : "Black";
    const moveNum = Math.ceil(lastMove.num / 2);

    fetch("/api/chess/commentary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ san: lastMove.san, moveNumber: moveNum, playerColor: side }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.comment) setCommentary(d.comment);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [lastMove]);

  // Engine moves whenever it's not the human's turn (or in AI-vs-AI)
  useEffect(() => {
    const g = gameRef.current;
    if (g.isGameOver() || endedRef.current || busyRef.current) return;

    const humanToMove = !autoplay && g.turn() === colorLetter(humanColor);
    if (humanToMove) return;

    let cancelled = false;
    busyRef.current = true;
    setThinking(true);

    (async () => {
      try {
        const res = await fetch("/api/chess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fen: g.fen(), difficulty }),
        });
        const data = await res.json();
        if (cancelled) return;
        const mv = data?.move;
        if (mv?.from && mv?.to) {
          const applied = g.move({
            from: mv.from,
            to: mv.to,
            promotion: mv.promotion || "q",
          });
          if (applied) afterMove(applied);
        } else {
          setStatus("The opponent is stumped — try a new game.");
        }
      } catch {
        if (!cancelled) setStatus("Opponent unavailable — try again.");
      } finally {
        if (!cancelled) {
          busyRef.current = false;
          setThinking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      busyRef.current = false;
    };
  }, [fen, autoplay, humanColor, difficulty, afterMove]);

  // Clock tick
  useEffect(() => {
    if (tc.initial === 0 || !started || endedRef.current) return;
    const id = setInterval(() => {
      const turn = gameRef.current.turn();
      if (turn === "w") setWhiteMs((m) => Math.max(0, m - 100));
      else setBlackMs((m) => Math.max(0, m - 100));
    }, 100);
    return () => clearInterval(id);
  }, [tc.initial, started, fen]);

  // Flag detection
  useEffect(() => {
    if (tc.initial === 0 || endedRef.current || !started) return;
    if (whiteMs <= 0) {
      endedRef.current = true;
      setStatus("White flagged — Black wins on time.");
      play(humanColor === "black" ? "win" : "lose");
    } else if (blackMs <= 0) {
      endedRef.current = true;
      setStatus("Black flagged — White wins on time.");
      play(humanColor === "white" ? "win" : "lose");
    }
  }, [whiteMs, blackMs, tc.initial, started, humanColor, play]);

  // Execute a move the chatbot requested on behalf of the user.
  useEffect(() => {
    if (!pendingMove) return;
    setPendingChessMove(null);

    const g = gameRef.current;
    if (g.isGameOver() || endedRef.current || busyRef.current) return;

    try {
      let move: Move | null = null;
      const pm = pendingMove.trim().toLowerCase();
      // UCI format: e2e4 or e2e4q (with promotion)
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(pm)) {
        move = g.move({
          from: pm.slice(0, 2) as Square,
          to: pm.slice(2, 4) as Square,
          promotion: pm[4] || "q",
        });
      } else {
        // SAN format: e4, Nf3, O-O, etc.
        move = g.move(pm);
      }
      if (move) afterMove(move);
    } catch {
      // Invalid move — silently ignore, board stays unchanged.
    }
  }, [pendingMove, setPendingChessMove, afterMove]);

  // Click-to-move handler
  const onSquareClick = useCallback(
    (square: Square) => {
      if (autoplay || thinking || busyRef.current || endedRef.current) return;
      const g = gameRef.current;
      if (g.turn() !== colorLetter(humanColor)) return;

      const piece = g.get(square);

      if (selectedSquare) {
        // Try to move the selected piece to this square
        try {
          const isPromo =
            g.get(selectedSquare)?.type === "p" &&
            (square[1] === "8" || square[1] === "1");
          const move = g.move({
            from: selectedSquare,
            to: square,
            promotion: isPromo ? "q" : undefined,
          });
          if (move) {
            afterMove(move);
            return;
          }
        } catch {
          // not a legal move
        }

        // If clicking another friendly piece, switch selection
        if (piece && piece.color === colorLetter(humanColor)) {
          setSelectedSquare(square);
          const moves = g.moves({ square, verbose: true }).map((m) => m.to as Square);
          setValidMoveSquares(moves);
        } else {
          setSelectedSquare(null);
          setValidMoveSquares([]);
        }
      } else {
        // Select if it's a friendly piece
        if (piece && piece.color === colorLetter(humanColor)) {
          setSelectedSquare(square);
          const moves = g.moves({ square, verbose: true }).map((m) => m.to as Square);
          setValidMoveSquares(moves);
        }
      }
    },
    [autoplay, thinking, humanColor, selectedSquare, afterMove]
  );

  // Drag-and-drop handler (kept alongside click)
  const onDrop = useCallback(
    (from: string, to: string, piece: string) => {
      if (autoplay || thinking || busyRef.current || endedRef.current) return false;
      const g = gameRef.current;
      if (g.turn() !== colorLetter(humanColor)) return false;

      const promo =
        piece?.[1] === "P" && (to[1] === "8" || to[1] === "1") ? "q" : undefined;
      let move: Move | null = null;
      try {
        move = g.move({ from, to, promotion: promo });
      } catch {
        play("illegal");
        return false;
      }
      if (!move) return false;
      afterMove(move);
      return true;
    },
    [autoplay, thinking, humanColor, afterMove, play]
  );

  const resetClocks = useCallback(
    (control = tc) => {
      setWhiteMs(control.initial * 1000);
      setBlackMs(control.initial * 1000);
      setStarted(false);
    },
    [tc]
  );

  const newGame = useCallback(() => {
    busyRef.current = false;
    endedRef.current = false;
    gameRef.current = new Chess();
    setAutoplay(false);
    setThinking(false);
    setSelectedSquare(null);
    setValidMoveSquares([]);
    setCommentary(null);
    setLastMove(null);
    setCaptured({ byWhite: [], byBlack: [] });
    resetClocks();
    sync();
  }, [resetClocks, sync]);

  const switchSides = useCallback(() => {
    const next: PlayerColor = humanColor === "white" ? "black" : "white";
    setHumanColor(next);
    setOrientation(next);
    setSelectedSquare(null);
    setValidMoveSquares([]);
    setFen(gameRef.current.fen());
  }, [humanColor]);

  const changeTC = useCallback((_id: TCId) => {
    setTcId(_id);
    const control = TIME_CONTROLS.find((t) => t.id === _id)!;
    busyRef.current = false;
    endedRef.current = false;
    gameRef.current = new Chess();
    setAutoplay(false);
    setThinking(false);
    setSelectedSquare(null);
    setValidMoveSquares([]);
    setCommentary(null);
    setLastMove(null);
    setWhiteMs(control.initial * 1000);
    setBlackMs(control.initial * 1000);
    setStarted(false);
    sync();
  }, [sync]);

  // Build custom square styles for selected + valid move highlights
  const customSquareStyles: Record<string, React.CSSProperties> = {};
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { backgroundColor: SELECTED_COLOR };
    for (const sq of validMoveSquares) {
      customSquareStyles[sq] = { backgroundColor: VALID_MOVE_COLOR };
    }
  }

  const gameOver = gameRef.current.isGameOver() || endedRef.current;
  const turn = gameRef.current.turn();

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Status + sound toggle */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            gameOver
              ? "bg-koda-accent/15 text-koda-accent-soft"
              : "bg-koda-surface-2 text-koda-text"
          )}
        >
          {thinking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-koda-accent" />
          ) : gameOver ? (
            <Sparkles className="h-3.5 w-3.5" />
          ) : (
            <Bot className="h-3.5 w-3.5 text-koda-muted" />
          )}
          {thinking ? "Thinking…" : status}
        </span>
        <button
          onClick={() => setMuted((v) => !v)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="ml-auto rounded-lg p-1.5 text-koda-muted transition-colors hover:bg-koda-surface-2 hover:text-koda-text"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {/* AI Commentary bubble */}
      {commentary && (
        <div className="flex items-start gap-2 rounded-xl border border-koda-accent/20 bg-koda-accent/5 px-3 py-2">
          <Mic2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-koda-accent" />
          <p className="text-xs leading-relaxed text-koda-text/80 italic">{commentary}</p>
        </div>
      )}

      {/* Clocks (hidden when unlimited) */}
      {tc.initial > 0 && (
        <div className="flex items-center gap-2">
          <ClockChip label="White" ms={whiteMs} active={!gameOver && turn === "w"} />
          <ClockChip label="Black" ms={blackMs} active={!gameOver && turn === "b"} />
        </div>
      )}

      {/* Captured pieces — opponent's captures shown above the board */}
      {(captured.byWhite.length > 0 || captured.byBlack.length > 0) && (
        <div className="space-y-1 rounded-lg border border-koda-border bg-koda-surface/40 px-3 py-1.5">
          {captured.byWhite.length > 0 && (
            <CapturedRow
              pieces={captured.byWhite}
              color="w"
              advantage={Math.max(0, materialScore(captured.byWhite) - materialScore(captured.byBlack))}
            />
          )}
          {captured.byBlack.length > 0 && (
            <CapturedRow
              pieces={captured.byBlack}
              color="b"
              advantage={Math.max(0, materialScore(captured.byBlack) - materialScore(captured.byWhite))}
            />
          )}
        </div>
      )}

      {/* Board */}
      <div ref={wrapRef} className="mx-auto w-full max-w-[440px]">
        <Chessboard
          position={fen}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick}
          boardOrientation={orientation}
          boardWidth={boardW}
          arePiecesDraggable={!autoplay && !gameOver}
          animationDuration={200}
          customSquareStyles={customSquareStyles}
          customBoardStyle={{
            borderRadius: "10px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
          }}
          customLightSquareStyle={{ backgroundColor: LIGHT }}
          customDarkSquareStyle={{ backgroundColor: DARK }}
        />
      </div>

      {/* Time control selector */}
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-koda-muted" />
        {TIME_CONTROLS.map((t) => (
          <button
            key={t.id}
            onClick={() => changeTC(t.id)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              t.id === tcId
                ? "bg-koda-accent/20 text-koda-accent-soft"
                : "text-koda-muted hover:bg-koda-surface-2 hover:text-koda-text"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={newGame}
          className="inline-flex items-center gap-1.5 rounded-lg border border-koda-border bg-koda-surface px-3 py-1.5 text-xs font-medium text-koda-text transition-colors hover:bg-koda-surface-2"
        >
          <RotateCcw className="h-3.5 w-3.5" /> New game
        </button>
        <button
          onClick={switchSides}
          disabled={thinking}
          className="inline-flex items-center gap-1.5 rounded-lg border border-koda-border bg-koda-surface px-3 py-1.5 text-xs font-medium text-koda-text transition-colors hover:bg-koda-surface-2 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Switch sides
        </button>
        <button
          onClick={() => setAutoplay((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            autoplay
              ? "border-koda-accent/50 bg-koda-accent/15 text-koda-accent-soft"
              : "border-koda-border bg-koda-surface text-koda-text hover:bg-koda-surface-2"
          )}
        >
          <Bot className="h-3.5 w-3.5" /> {autoplay ? "Watching AI vs AI" : "AI vs AI"}
        </button>
      </div>

      {/* Move history */}
      {history.length > 0 && (
        <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-koda-border bg-koda-surface/50 p-2 text-xs [scrollbar-width:thin]">
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-0.5">
            {pairHistory(history).map((row, i) => (
              <div key={i} className="contents">
                <span className="text-koda-muted/60">{i + 1}.</span>
                <span className="text-koda-text">{row[0]}</span>
                <span className="text-koda-text">{row[1] ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClockChip({
  label,
  ms,
  active,
}: {
  label: string;
  ms: number;
  active: boolean;
}) {
  const low = ms <= 10000;
  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-between rounded-lg border px-3 py-1.5 transition-colors",
        active
          ? "border-koda-accent/50 bg-koda-accent/10"
          : "border-koda-border bg-koda-surface"
      )}
    >
      <span className="text-xs text-koda-muted">{label}</span>
      <span
        className={cn(
          "font-mono text-base font-semibold tabular-nums",
          low ? "text-red-400" : "text-koda-text"
        )}
      >
        {fmt(ms)}
      </span>
    </div>
  );
}

function pairHistory(moves: string[]): [string, string?][] {
  const rows: [string, string?][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]]);
  return rows;
}
