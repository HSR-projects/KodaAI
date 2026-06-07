import { NextResponse } from "next/server";
import { listModels, DEFAULT_MODEL, FORCE_MODEL, isBlockedModel, OllamaError } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // When a model is force-pinned, only expose that one so the picker matches
  // what actually runs.
  if (FORCE_MODEL) {
    return NextResponse.json({ models: [FORCE_MODEL], default: FORCE_MODEL });
  }
  try {
    const models = await listModels();
    // Drop privacy-blocklisted models (e.g. prompt-tracking preview models) so
    // they're never selectable or used.
    const names = models.map((m) => m.name).filter((n) => n && !isBlockedModel(n));
    // Ensure the configured default is selectable even if /api/tags omits it.
    if (DEFAULT_MODEL && !names.includes(DEFAULT_MODEL)) {
      names.unshift(DEFAULT_MODEL);
    }
    return NextResponse.json({ models: names, default: DEFAULT_MODEL });
  } catch (e) {
    const message =
      e instanceof OllamaError ? e.message : "Failed to reach Ollama Cloud.";
    return NextResponse.json(
      { models: [], default: DEFAULT_MODEL, error: message },
      { status: 502 }
    );
  }
}
