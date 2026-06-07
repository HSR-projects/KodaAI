// ─── Focus modes ──────────────────────────────────────────────
export type FocusMode = "all" | "nosearch" | "code" | "academic";

// ─── Chat / messages ──────────────────────────────────────────
export type Role = "user" | "assistant" | "system";

export interface Source {
  url: string;
  title: string;
  content: string;
  snippet?: string;
}

// ─── Attachments ──────────────────────────────────────────────
export type AttachmentKind = "image" | "text" | "audio" | "other";

export interface Attachment {
  id: string;
  /** Original filename. */
  name: string;
  kind: AttachmentKind;
  /** MIME type, e.g. "image/png", "text/plain", "audio/mpeg". */
  mime: string;
  /** Size in bytes. */
  size: number;
  /**
   * Payload. For images/audio: raw base64 (no data: prefix). For text: the
   * extracted UTF-8 text. Stripped from the copy stored on a message to keep
   * persisted threads small — only present on the in-flight send.
   */
  data?: string;
  /** Small data-URL thumbnail for image previews (persisted on the message). */
  thumbUrl?: string;
}

// ─── Agentic steps ────────────────────────────────────────────
export type StepStatus = "active" | "done" | "skipped" | "error";

export interface AgentStep {
  id: string;
  label: string;
  status: StepStatus;
  /** Optional secondary line (e.g. "4 sources", "answered from knowledge"). */
  detail?: string;
}

// ─── Agent Swarm ──────────────────────────────────────────────
export type SwarmAgentRole = "researcher" | "analyst" | "critic" | "synthesizer";
export type SwarmAgentStatus = "pending" | "thinking" | "done" | "error";

export interface SwarmAgentRun {
  id: string;
  role: SwarmAgentRole;
  label: string;
  status: SwarmAgentStatus;
  output?: string;
  sourceCount?: number;
}

/** Result of the lightweight "do we need to search?" routing call. */
export interface RouteDecision {
  needsSearch: boolean;
  searchQuery: string;
  reason: string;
}

// ─── Accounts & billing ───────────────────────────────────────
export type Plan = "free" | "pro" | "max";

/** Public user shape — never includes password material. */
export interface User {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  onboarded: boolean;
  defaultAgent?: string;
  avatarColor?: string;
  createdAt: number;
  /** Whether the user has confirmed their email address. */
  emailVerified: boolean;
  /**
   * Prepaid API credit balance, in US cents. Independent of the subscription
   * plan — API access is pure pay-as-you-go (see lib/credits.ts).
   */
  credits: number;
}

// ─── API keys & credits ───────────────────────────────────────
/** Masked API-key record returned to the client (never the full secret). */
export interface ApiKeyPublic {
  id: string;
  name: string;
  /** Last 4 chars of the secret, for identification. */
  last4: string;
  createdAt: number;
  lastUsedAt?: number;
  revoked?: boolean;
}

/** A purchasable credit pack (one-time Stripe payment). */
export interface CreditPack {
  id: string;
  label: string;
  /** Price in USD. */
  usd: number;
  /** Credits granted (US cents — 1 credit = $0.01). */
  credits: number;
  /** Optional marketing note, e.g. "Most popular". */
  note?: string;
}

/** Usage/metering returned by the public API. */
export interface ApiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Credits charged for this request (US cents). */
  creditsCharged: number;
  /** Remaining balance after the charge (US cents). */
  creditsRemaining: number;
}

// ─── Artifacts (Claude-style side panel) ──────────────────────
export type PlayerColor = "white" | "black";

export type Artifact =
  | {
      type: "chess";
      title: string;
      /** Side the human plays; the agent takes the other. */
      playerColor: PlayerColor;
    }
  | {
      type: "html";
      title: string;
      /** Raw markup/code rendered in a sandboxed frame. */
      code: string;
    }
  | {
      type: "computer";
      /** Project name shown in the panel header. */
      title: string;
    }
  | {
      type: "slides";
      /** Deck title shown in the panel header. */
      title: string;
    }
  | {
      type: "sheet";
      /** Workbook title shown in the panel header. */
      title: string;
    }
  | {
      type: "website";
      /** Site title shown in the panel header. */
      title: string;
    };

export type ArtifactType = Artifact["type"];

// ─── Spreadsheets (Excel generator) ───────────────────────────
export interface SheetTable {
  name: string;
  /** Row-major grid of cell strings (first row is typically the header). */
  rows: string[][];
}

export interface Workbook {
  title: string;
  sheets: SheetTable[];
  status: "building" | "ready";
}

// ─── Slides (presentation generator) ──────────────────────────
export interface Slide {
  title: string;
  bullets: string[];
  /** Optional speaker notes. */
  notes?: string;
}

export interface SlideDeck {
  title: string;
  slides: Slide[];
  status: "building" | "ready";
  /** Visual template id (see lib/slideTemplates). */
  template?: string;
}

// ─── Koda's Computer (sandboxed project workspace) ────────────
/** One file in a generated project. Path is relative, e.g. "src/App.jsx". */
export interface ProjectFile {
  path: string;
  content: string;
}

/**
 * Lifecycle of a sandbox build, mirrored in the terminal:
 * building (files streaming) → installing → running (dev server) → ready.
 */
export type ComputerStatus =
  | "building"
  | "installing"
  | "running"
  | "ready"
  | "error";

/**
 * A project the model built inside Koda's Computer. This lives ONLY in the
 * transient part of the store — it is never persisted to localStorage nor
 * written into thread history, so a sandbox can't leak into other chats.
 */
/** A static website (HTML/CSS/JS) built by the all-tier Website builder. */
export interface WebsiteProject {
  title: string;
  files: ProjectFile[];
  status: "building" | "ready";
}

export interface ComputerProject {
  title: string;
  files: ProjectFile[];
  /** Shell commands the model asked to run (npm install, npm run dev, …). */
  commands: string[];
  /** Streamed terminal output, for the "executing commands" feel. */
  terminal: string[];
  status: ComputerStatus;
  /** Path of the file currently shown in the code viewer. */
  activePath?: string;
  /** Error text when status is "error". */
  error?: string;
}

/** Engine move returned by the internal chess oracle (engine never named). */
export interface EngineMove {
  uci: string;
  from: string;
  to: string;
  promotion?: string;
}

/** An AI-requested image being generated (via Puter.js) for an answer. */
export interface GeneratedImage {
  id: string;
  /** The visual prompt the model emitted. */
  prompt: string;
  /** Data/URL of the finished image. */
  url?: string;
  status: "loading" | "done" | "error";
  error?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  /** Sources attached to an assistant answer (search-augmented). */
  sources?: Source[];
  /** Images generated for this answer (text-to-image). */
  generatedImages?: GeneratedImage[];
  /** AI-generated follow-up questions shown under an assistant answer. */
  followups?: string[];
  /** Live agent activity trace (understanding → search → reading → writing). */
  steps?: AgentStep[];
  /** Parallel swarm agent runs — shown in SwarmPanel above the answer. */
  swarmAgents?: SwarmAgentRun[];
  /** Files the user attached to this message (display metadata only). */
  attachments?: Attachment[];
  /**
   * Snapshot of a Koda's Computer sandbox built in this answer. Persisted with
   * the thread so re-opening (or revisiting the chat later) restores the exact
   * project without re-generating it — but it stays scoped to THIS chat and is
   * never shared into other conversations.
   */
  computer?: { title: string; files: ProjectFile[]; commands: string[] };
  /**
   * Snapshot of a slide deck built in this answer — persisted with the thread
   * so the chat's "Open slides" card can restore it without re-generating.
   */
  slides?: { title: string; slides: Slide[]; template?: string };
  /** Snapshot of a spreadsheet built in this answer (persisted per-chat). */
  sheet?: { title: string; sheets: SheetTable[] };
  /** Snapshot of a static website built in this answer (persisted per-chat). */
  website?: { title: string; files: ProjectFile[] };
  /** Marker that this answer opened a chess game — shows a resume card. */
  chess?: { playerColor: PlayerColor };
  /** Focus mode used to produce this message. */
  focusMode?: FocusMode;
  /** Thumbs up/down feedback the user left on an assistant answer. */
  feedback?: "up" | "down";
  /** True while tokens are still streaming in. */
  streaming?: boolean;
  /** Error text, if the turn failed. */
  error?: string;
  createdAt: number;
}

export interface Thread {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// ─── API payloads ─────────────────────────────────────────────
export interface ChatRequestBody {
  query: string;
  threadHistory: { role: Role; content: string }[];
  model: string;
  focusMode: FocusMode;
  sources?: Source[];
  /** Base64 image payloads (no data: prefix) for vision-capable models. */
  images?: string[];
  /** Internal/utility call (e.g. title generation) — exempt from usage limits. */
  internal?: boolean;
}

export type ChatStreamEvent =
  | { type: "token"; content: string }
  | { type: "followups"; questions: string[] }
  | { type: "error"; message: string }
  | { type: "done" };

export type SwarmStreamEvent =
  | { type: "init"; agents: SwarmAgentRun[] }
  | { type: "agent_update"; agentId: string; status: SwarmAgentStatus; output?: string; sourceCount?: number }
  | { type: "specialist_token"; agentId: string; content: string }
  | { type: "synthesis_token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Full page extract, when the backend provides it (e.g. Ollama web search). */
  content?: string;
}

// ─── Ollama wire types ────────────────────────────────────────
export interface OllamaMessage {
  role: Role;
  content: string;
  /** Base64 image payloads (no data: prefix) for vision models. */
  images?: string[];
}

export interface OllamaModel {
  name: string;
  model?: string;
  size?: number;
  modified_at?: string;
}
