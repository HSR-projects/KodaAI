import { NextResponse } from "next/server";
import { chat, DEFAULT_MODEL, OllamaError } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMENTATOR_PROMPTS = [
  (san: string, num: number, side: string) =>
    `You are an unhinged, dramatic chess commentator. React to: ${side} plays ${san} on move ${num}. One explosive sentence, max 18 words. No quotes, no asterisks.`,
  (san: string, num: number, side: string) =>
    `Chess hype-man mode. ${side} just played ${san} (move ${num}). Give a wild, funny one-liner reaction, max 18 words. No quotes.`,
];

export async function POST(req: Request) {
  try {
    const { san, moveNumber, playerColor } = await req.json();
    if (!san) return NextResponse.json({ comment: null });

    const idx = Math.floor(Math.random() * COMMENTATOR_PROMPTS.length);
    const prompt = COMMENTATOR_PROMPTS[idx](san, moveNumber, playerColor);

    const raw = await chat({
      model: DEFAULT_MODEL,
      messages: [{ role: "user", content: prompt }],
      options: { temperature: 0.95 },
    });

    const comment = raw.trim().replace(/^["']|["']$/g, "").slice(0, 140);
    return NextResponse.json({ comment });
  } catch (e) {
    if (e instanceof OllamaError) return NextResponse.json({ comment: null });
    return NextResponse.json({ comment: null });
  }
}
