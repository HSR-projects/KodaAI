import type { Plan } from "@/types";

export interface PlanDef {
  id: Plan;
  name: string;
  /** Display price, e.g. "$0" or "$20". */
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}

/** Marketing/pricing definitions shown on the upgrade screen. */
export const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "Search-augmented chat and a casual chess opponent.",
    cta: "Current plan",
    features: [
      "Auto model (1 model, auto-selected)",
      "Auto web search when needed",
      "Streaming cited answers",
      "Chess up to Club strength",
      "Interactive artifacts & code preview",
      "PowerPoint slides (up to 20 per deck)",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$200",
    period: "/month",
    tagline: "Autonomous research agents and a tougher board.",
    cta: "Upgrade to Pro",
    highlight: true,
    features: [
      "Everything in Free",
      "All models — choose any KodaAI model",
      "Autonomous task agent (multi-step research)",
      "Up to 4 agent steps per task",
      "Agent Swarm — 3 parallel AI specialists",
      "AI image generation (text-to-image)",
      "Koda's Computer — build, preview & download live apps",
      "PowerPoint slides — up to 70 per deck",
      "Chess up to Strong (skill 8)",
      "Priority answer streaming",
    ],
  },
  {
    id: "max",
    name: "Max",
    price: "$600",
    period: "/month",
    tagline: "Maximum depth — for power research and full-strength play.",
    cta: "Upgrade to Max",
    features: [
      "Everything in Pro",
      "All models — maximum context windows",
      "Deep agent runs — up to 8 steps",
      "Agent Swarm — 4 parallel specialists",
      "Full-strength chess (skill 20)",
      "Early access to new agents",
    ],
  },
];

/** Capability gates derived from the active plan. */
export interface PlanCaps {
  agent: boolean;
  agentSteps: number;
  chessMax: number;
  allModels: boolean;
  /** Can the user run Agent Swarm (parallel specialists)? */
  swarm: boolean;
  /** Total swarm agents including synthesizer (Pro=3, Max=4). */
  swarmAgents: number;
  /** Can the user generate images (text-to-image)? Pro/Max only. */
  imageGen: boolean;
  /** Can the user use Koda's Computer (build/preview/download apps)? Pro/Max only. */
  computer: boolean;
  /** Max slides per presentation. Free is limited; Pro/Max get the full deck. */
  slidesMax: number;
}

export const CAPS: Record<Plan, PlanCaps> = {
  free: { agent: false, agentSteps: 0, chessMax: 5,  allModels: false, swarm: false, swarmAgents: 0, imageGen: false, computer: false, slidesMax: 20 },
  pro:  { agent: true,  agentSteps: 4, chessMax: 8,  allModels: true,  swarm: true,  swarmAgents: 3, imageGen: true,  computer: true,  slidesMax: 70 },
  max:  { agent: true,  agentSteps: 8, chessMax: 10, allModels: true,  swarm: true,  swarmAgents: 4, imageGen: true,  computer: true,  slidesMax: 70 },
};

export function planDef(id: Plan): PlanDef {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}
