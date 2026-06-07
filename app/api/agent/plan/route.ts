import { NextResponse } from "next/server";
import { chat, DEFAULT_MODEL, OllamaError } from "@/lib/ollama";
import { buildAgentPlanPrompt } from "@/lib/prompts";
import { getCurrentUser } from "@/lib/auth";
import { CAPS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PlanRequestBody {
  goal: string;
  model?: string;
  maxSteps?: number;
}

/**
 * Autonomous agent planner — Pro/Max only. Returns a list of focused search
 * sub-queries for the client to execute, capped by the user's plan.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const caps = CAPS[user?.plan ?? "free"];
  if (!caps.agent) {
    return NextResponse.json(
      { error: "Agent mode requires Pro or Max." },
      { status: 402 }
    );
  }

  let body: PlanRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { goal, model = DEFAULT_MODEL } = body;
  if (!goal?.trim()) {
    return NextResponse.json({ error: "Missing goal." }, { status: 400 });
  }
  const maxSteps = Math.max(
    1,
    Math.min(caps.agentSteps, Math.round(body.maxSteps ?? caps.agentSteps))
  );

  try {
    const raw = await chat({
      model,
      messages: [{ role: "user", content: buildAgentPlanPrompt(goal, maxSteps) }],
      options: { temperature: 0.2 },
    });
    const steps = parseSteps(raw, goal).slice(0, maxSteps);
    return NextResponse.json({ steps });
  } catch (e) {
    // Degrade to a single-query plan rather than failing the whole run.
    if (e instanceof OllamaError) {
      return NextResponse.json({ steps: [goal] });
    }
    return NextResponse.json({ steps: [goal] });
  }
}

function parseSteps(raw: string, goal: string): string[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) {
        const steps = arr
          .filter((x) => typeof x === "string")
          .map((x: string) => x.trim())
          .filter(Boolean);
        if (steps.length) return steps;
      }
    } catch {
      /* fall through */
    }
  }
  return [goal];
}
