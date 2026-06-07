import { NextResponse } from "next/server";
import { chat, DEFAULT_MODEL, OllamaError } from "@/lib/ollama";
import { buildRouterPrompt } from "@/lib/prompts";
import type { RouteDecision, Role } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteRequestBody {
  query: string;
  model?: string;
  history?: { role: Role; content: string }[];
}

/**
 * Agentic search router. Returns whether the query needs a live web search.
 * Fails open: if the model is unreachable or returns garbage, we default to
 * searching (better to over-ground than answer stale).
 */
export async function POST(req: Request) {
  let body: RouteRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { query, model = DEFAULT_MODEL, history = [] } = body;
  if (!query?.trim()) {
    return NextResponse.json({ error: "Missing query." }, { status: 400 });
  }

  const fallback: RouteDecision = {
    needsSearch: true,
    searchQuery: query,
    reason: "defaulted to search",
  };

  try {
    const raw = await chat({
      model,
      messages: [{ role: "user", content: buildRouterPrompt(query, history) }],
      options: { temperature: 0 },
    });
    return NextResponse.json(parseDecision(raw, query) ?? fallback);
  } catch (e) {
    if (e instanceof OllamaError) {
      // Model unreachable — let the caller decide; default to search.
      return NextResponse.json(fallback);
    }
    return NextResponse.json(fallback);
  }
}

function parseDecision(raw: string, query: string): RouteDecision | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Partial<RouteDecision>;
    if (typeof obj.needsSearch !== "boolean") return null;
    return {
      needsSearch: obj.needsSearch,
      searchQuery:
        (typeof obj.searchQuery === "string" && obj.searchQuery.trim()) ||
        query,
      reason:
        (typeof obj.reason === "string" && obj.reason.trim().slice(0, 80)) ||
        (obj.needsSearch ? "needs fresh info" : "answerable directly"),
    };
  } catch {
    return null;
  }
}
