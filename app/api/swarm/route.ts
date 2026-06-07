import { getCurrentUser } from "@/lib/auth";
import { CAPS } from "@/lib/plans";
import { chatStream, DEFAULT_MODEL } from "@/lib/ollama";
import { searchWeb } from "@/lib/searxng";
import { scrapeUrls } from "@/lib/scraper";
import {
  buildSourceContext,
  COMPUTER_INSTRUCTIONS,
  WEBSITE_INSTRUCTIONS,
  SHEETS_INSTRUCTIONS,
  slidesInstructions,
} from "@/lib/prompts";
import type { Source, SwarmAgentRun, SwarmAgentRole, SwarmStreamEvent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Specialist definitions ────────────────────────────────────

interface SpecialistDef {
  role: Exclude<SwarmAgentRole, "synthesizer">;
  label: string;
  /** Transforms the user query into a focused search query for this role. */
  searchQuery: (q: string) => string;
  systemPrompt: string;
}

const SPECIALISTS: SpecialistDef[] = [
  {
    role: "researcher",
    label: "Deep Researcher",
    searchQuery: (q) => q,
    systemPrompt:
      "You are the Deep Researcher in a KodaAI Agent Swarm. " +
      "Your job is exhaustive fact-finding. Search multiple angles of the topic and surface concrete data: " +
      "numbers, dates, names, studies, statistics, direct quotes from primary sources. " +
      "Do NOT editorialize — stick to verifiable information. " +
      "Cite sources inline as [1], [2] etc. when provided. " +
      "Write a dense, information-rich report of 300–400 words. Every sentence should add a new fact.",
  },
  {
    role: "analyst",
    label: "Reasoner",
    searchQuery: (q) => `${q} mechanisms causes implications underlying factors`,
    systemPrompt:
      "You are the Reasoner in a KodaAI Agent Swarm. " +
      "You think in first principles and logical chains. Do NOT just restate facts — explain the WHY behind them. " +
      "Break down root causes, trace cause-and-effect chains, identify hidden assumptions, and reason step by step to conclusions. " +
      "Use structured thinking: hypothesis → evidence → conclusion. Challenge surface-level narratives. " +
      "Write a rigorous analytical report of 300–400 words. Show your reasoning process, not just results.",
  },
  {
    role: "critic",
    label: "Media Scout",
    searchQuery: (q) => `${q} news coverage public opinion narrative media`,
    systemPrompt:
      "You are the Media Scout in a KodaAI Agent Swarm. " +
      "Your job is to map how this topic is covered, framed, and debated in public discourse. " +
      "What is the dominant narrative? What are competing narratives? Who is pushing each angle? " +
      "What is underreported or sensationalized? What do different audiences believe? " +
      "Analyze the media and public-opinion landscape around this topic critically. " +
      "Cite sources inline as [1], [2] etc. when provided. " +
      "Write a sharp media-intelligence report of 300–400 words.",
  },
];

const SYNTH_SYSTEM =
  "You are the Synthesizer in a KodaAI Agent Swarm. " +
  "Three specialist agents — a Deep Researcher, a Reasoner, and a Media Scout — have each written a report on the user's query. " +
  "Your job: weave their findings into one authoritative, well-structured answer in markdown. " +
  "Lead with the strongest insight. Layer in research facts, the logical reasoning behind them, and the media/public context. " +
  "Resolve contradictions explicitly. Cut redundancy ruthlessly. " +
  "When attribution adds real clarity, note it as (Researcher), (Reasoner), or (Media Scout) — " +
  "but only when it matters, not mechanically. " +
  "The result should feel like a single expert wrote it after consulting three specialists. " +
  "Use headers, bullet points, or tables when they genuinely help — don't force structure on simple answers.";

// ── Helpers ───────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function agentUserMsg(query: string, sources: Source[]): string {
  const ctx = sources.length ? buildSourceContext(sources) + "\n\n" : "";
  return `${ctx}Query: ${query}`;
}

function synthUserMsg(query: string, reports: { label: string; output: string }[]): string {
  const sections = reports
    .map((r) => `--- ${r.label} Report ---\n${r.output}`)
    .join("\n\n");
  return `Specialist agent reports for: "${query}"\n\n${sections}\n\nSynthesize these into a complete, well-structured answer.`;
}

// ── Route ─────────────────────────────────────────────────────

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const caps = CAPS[user?.plan ?? "free"];

  if (!caps.swarm) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Agent Swarm requires Pro or Max." })}\n\n`,
      { status: 402, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  let body: { query?: string; model?: string; targetUrl?: string; images?: string[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid body.", { status: 400 });
  }

  const { query, model = DEFAULT_MODEL, targetUrl, images = [] } = body;
  if (!query?.trim()) {
    return new Response("Missing query.", { status: 400 });
  }
  // Images are only attached to specialists' user turns (the synthesizer works
  // from their text reports). Ignored by text-only models.
  const imagePayload = Array.isArray(images) && images.length ? images : undefined;

  // specialists = swarmAgents cap - 1 (synthesizer always occupies the last slot)
  const specialistCount = Math.min(caps.swarmAgents - 1, SPECIALISTS.length);
  const specialists = SPECIALISTS.slice(0, specialistCount);

  const agentList: SwarmAgentRun[] = [
    ...specialists.map((s) => ({
      id: uid(),
      role: s.role as SwarmAgentRole,
      label: s.label,
      status: "pending" as const,
    })),
    { id: uid(), role: "synthesizer" as const, label: "Synthesizer", status: "pending" as const },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (evt: SwarmStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      push({ type: "init", agents: agentList });

      // Shared sources when a URL is provided (all agents read the same page)
      let sharedSources: Source[] = [];
      if (targetUrl) {
        sharedSources = await scrapeUrls([targetUrl]).catch(() => []);
      }

      // Run all specialists in parallel
      const reports: { label: string; output: string }[] = [];

      await Promise.allSettled(
        specialists.map(async (spec, i) => {
          const agent = agentList[i];
          push({ type: "agent_update", agentId: agent.id, status: "thinking" });

          try {
            let sources: Source[] = sharedSources;
            let sourceCount = sources.length;

            if (!targetUrl) {
              const results = await searchWeb(spec.searchQuery(query), 3).catch(() => []);
              const missingUrls = results.filter((r) => !r.content).map((r) => r.url);
              const scraped = missingUrls.length ? await scrapeUrls(missingUrls).catch(() => []) : [];
              const byUrl = new Map(scraped.map((s) => [s.url, s]));
              sources = results.map((r) => ({
                url: r.url,
                title: r.title,
                content: r.content || byUrl.get(r.url)?.content || r.snippet || "",
                snippet: r.snippet,
              }));
              sourceCount = sources.length;
            }

            let output = "";
            for await (const token of chatStream({
              model,
              messages: [
                { role: "system", content: spec.systemPrompt },
                {
                  role: "user",
                  content: agentUserMsg(query, sources),
                  ...(imagePayload ? { images: imagePayload } : {}),
                },
              ],
              options: { temperature: 0.3 },
            })) {
              output += token;
              push({ type: "specialist_token", agentId: agent.id, content: token });
            }

            reports.push({ label: spec.label, output });
            push({ type: "agent_update", agentId: agent.id, status: "done", output, sourceCount });
          } catch {
            push({ type: "agent_update", agentId: agent.id, status: "error" });
          }
        })
      );

      // Synthesizer runs after all specialists complete. Swarm is Pro/Max, so it
      // can also build artifacts (Koda's Computer, websites, slides, spreadsheets)
      // when the user asked to BUILD/CREATE something rather than just research.
      const synthAgent = agentList[agentList.length - 1];
      push({ type: "agent_update", agentId: synthAgent.id, status: "thinking" });

      const synthSystem = `${SYNTH_SYSTEM}\n\n${COMPUTER_INSTRUCTIONS}\n\n${WEBSITE_INSTRUCTIONS}\n\n${slidesInstructions(caps.slidesMax)}\n\n${SHEETS_INSTRUCTIONS}`;

      try {
        for await (const token of chatStream({
          model,
          messages: [
            { role: "system", content: synthSystem },
            { role: "user", content: synthUserMsg(query, reports) },
          ],
        })) {
          push({ type: "synthesis_token", content: token });
        }
        push({ type: "agent_update", agentId: synthAgent.id, status: "done" });
      } catch {
        push({ type: "agent_update", agentId: synthAgent.id, status: "error" });
      }

      push({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
