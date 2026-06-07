"use client";

import { useCallback, useRef, useState } from "react";
import { useKodaStore } from "@/lib/store";
import { uid, modelLabel } from "@/lib/utils";
import { AUTO_MODEL, pickAutoModel } from "@/lib/autoModel";
import { buildAttachments, toDisplayAttachment } from "@/lib/attachments";
import { supportsAudio, supportsVision } from "@/lib/modelCapabilities";
import { generateImage, editImage } from "@/lib/puter";
import { stripComputerSyntax, stripWebsiteSyntax } from "@/lib/computerParser";
import { isReactProject } from "@/lib/computerPreview";
import { stripSlidesSyntax } from "@/lib/slidesParser";
import { stripSheetSyntax } from "@/lib/sheetsParser";
import { makeBuildState, detectBuilds, finalizeBuilds } from "@/lib/artifactDirectives";
import type { ProjectFile } from "@/types";
import type {
  AgentStep,
  Attachment,
  ChatStreamEvent,
  FocusMode,
  GeneratedImage,
  Message,
  PlayerColor,
  RouteDecision,
  SearchResult,
  Source,
  StepStatus,
  SwarmAgentRun,
  SwarmAgentStatus,
  SwarmStreamEvent,
} from "@/types";

interface SendOptions {
  /** Override the store focus mode for this single turn. */
  focusMode?: FocusMode;
  /** Run the autonomous multi-step research agent (Pro/Max). */
  agent?: boolean;
  /** Max search steps the agent may run (from the user's plan caps). */
  agentSteps?: number;
  /** Run Agent Swarm — parallel specialists + synthesizer (Pro/Max). */
  swarm?: boolean;
  /** Total swarm agent count from plan caps (includes synthesizer). */
  swarmAgents?: number;
  /** If set, read this URL instead of searching the web. */
  targetUrl?: string;
  /** Files attached to this turn (images, text, audio). */
  attachments?: Attachment[];
  /** Whether the plan allows text-to-image generation (Pro/Max). */
  imageGen?: boolean;
  /** Whether the plan allows Koda's Computer (build/preview apps) (Pro/Max). */
  computer?: boolean;
  /** Max slides per deck for this plan (Free 20, Pro/Max 70). */
  slidesMax?: number;
}

/**
 * Drives a full agentic turn for a thread:
 *   user msg → (optional) web search + scrape → streaming chat → follow-ups.
 */
export function useChat(threadId: string | null) {
  const [loading, setLoading] = useState(false);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const store = useKodaStore;

  const send = useCallback(
    async (query: string, opts: SendOptions = {}) => {
      if (!threadId || loading) return;
      const s = store.getState();
      const focusMode = opts.focusMode ?? s.focusMode;

      const attachments = opts.attachments ?? [];
      const hasImage = attachments.some((a) => a.kind === "image");
      const hasAudio = attachments.some((a) => a.kind === "audio");

      // Resolve "Auto" to the best available model for this specific task.
      // The sentinel is never sent to the API — we swap it here, per message.
      // Attachments bias the pick toward a vision/audio-capable model.
      const usingAuto = s.selectedModel === AUTO_MODEL;
      const model = usingAuto
        ? pickAutoModel(query, focusMode, s.availableModels, "", {
            needsVision: hasImage,
            needsAudio: hasAudio,
          })
        : s.selectedModel;

      if (!model) {
        // No model selected/available — surface as an assistant error.
        s.appendMessage(threadId, makeMsg("assistant", "", { error: "No model selected. Pick an Ollama Cloud model in the header.", focusMode }));
        return;
      }

      const attachmentCaps = {
        vision: supportsVision(model),
        audio: supportsAudio(model),
      };

      // A light difficulty hint can still be honored up-front; the decision to
      // OPEN the board, though, is the model's (via an artifact directive).
      const chessHint = detectChessIntent(query);
      if (chessHint?.difficulty) s.setChessDifficulty(chessHint.difficulty);

      // Existing Koda's Computer project in THIS chat (if any). When present, we
      // feed its files back to the model and merge edits into it, so follow-ups
      // modify the project instead of recreating it from scratch.
      const existingProject = opts.computer ? latestComputerSnapshot(s.getThread(threadId)) : null;

      setLoading(true);
      setSearchWarning(null);

      // Snapshot prior history BEFORE appending the new user message so the
      // current query doesn't appear twice when the chat API appends it.
      const historySnapshot = (s.getThread(threadId)?.messages ?? [])
        .filter((m) => m.content)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      // Is there an active chess game? Inject board context so the AI can
      // suggest or execute a legal move.
      const chessFen = s.chessFen;
      const isChessOpen = s.artifact?.type === "chess" && !!chessFen;

      // 1. User message (store lightweight attachment metadata for display)
      s.appendMessage(
        threadId,
        makeMsg("user", query, attachments.length ? { attachments: attachments.map(toDisplayAttachment) } : {})
      );

      // 2. Assistant placeholder (streaming)
      const assistantId = uid();
      s.appendMessage(threadId, {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        sources: [],
        steps: [],
        focusMode,
        createdAt: Date.now(),
      });

      const update = (patch: Partial<Message>) =>
        store.getState().updateMessage(threadId, assistantId, patch);

      // ── Agent step tracking ─────────────────────────────────
      const steps: AgentStep[] = [];
      const pushStep = (
        label: string,
        status: StepStatus = "active",
        detail?: string
      ): string => {
        const id = uid();
        steps.push({ id, label, status, detail });
        update({ steps: [...steps] });
        return id;
      };
      const setStep = (id: string, status: StepStatus, detail?: string) => {
        const st = steps.find((x) => x.id === id);
        if (st) {
          st.status = status;
          if (detail !== undefined) st.detail = detail;
        }
        update({ steps: [...steps] });
      };

      // Surface the Auto-picked model so the choice is transparent to the user.
      if (usingAuto) {
        pushStep(`Auto-selected ${modelLabel(model)}`, "done", "best model for this task");
      }

      // Show an "Analyzing image" step whenever images are attached.
      let imageAnalysisStep: string | null = null;
      if (hasImage && attachmentCaps.vision) {
        const imgCount = attachments.filter((a) => a.kind === "image").length;
        imageAnalysisStep = pushStep(
          imgCount > 1 ? `Analyzing ${imgCount} images` : "Analyzing image",
          "active"
        );
      }

      // Recent history for routing context (before the new turn's messages).
      const priorThread = store.getState().getThread(threadId);
      const routerHistory = (priorThread?.messages ?? [])
        .filter((m) => m.id !== assistantId && m.content)
        .slice(-4)
        .map((m) => ({ role: m.role, content: m.content }));

      // ── 3. Agent Swarm path (parallel specialists) ───────────
      if (opts.swarm && opts.swarmAgents && opts.swarmAgents > 1) {
        const controller = new AbortController();
        abortRef.current = controller;
        const swarmBuilt = buildAttachments(query, attachments, attachmentCaps);
        try {
          const res = await fetch("/api/swarm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: swarmBuilt.query,
              model,
              targetUrl: opts.targetUrl || undefined,
              images: swarmBuilt.images.length ? swarmBuilt.images : undefined,
            }),
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            const text = await res.text().catch(() => "");
            update({ streaming: false, error: text || "Swarm request failed." });
            return;
          }

          let synthAcc = "";
          // The synthesizer can build artifacts too (Computer/Website/Slides/Sheet).
          const swarmBuild = makeBuildState(opts, existingProject);
          await readSwarmSse(res.body, (evt) => {
            if (evt.type === "init") {
              update({ swarmAgents: evt.agents });
            } else if (evt.type === "agent_update") {
              const current = store.getState().getThread(threadId)
                ?.messages.find((m) => m.id === assistantId)?.swarmAgents ?? [];
              update({
                swarmAgents: current.map((a) =>
                  a.id === evt.agentId
                    ? { ...a, status: evt.status, output: evt.output ?? a.output, sourceCount: evt.sourceCount ?? a.sourceCount }
                    : a
                ),
              });
            } else if (evt.type === "specialist_token") {
              const cur = store.getState().getThread(threadId)
                ?.messages.find((m) => m.id === assistantId)?.swarmAgents ?? [];
              update({
                swarmAgents: cur.map((a) =>
                  a.id === evt.agentId
                    ? { ...a, output: (a.output ?? "") + evt.content }
                    : a
                ),
              });
            } else if (evt.type === "synthesis_token") {
              synthAcc += evt.content;
              detectBuilds(synthAcc, swarmBuild);
              update({ content: stripDirectives(synthAcc) });
            } else if (evt.type === "error") {
              update({ streaming: false, error: evt.message });
            }
          });

          // Persist any artifacts the synthesizer built + run the sandbox terminal.
          const swarmArtifacts = finalizeBuilds(synthAcc, swarmBuild, existingProject?.commands);
          if (Object.keys(swarmArtifacts.patch).length) update(swarmArtifacts.patch);
          if (swarmArtifacts.computer) void runComputerTerminal(swarmArtifacts.computer.files, swarmArtifacts.computer.commands);

          update({ streaming: false });
          syncThread(threadId);
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            update({ streaming: false, error: "Swarm connection interrupted." });
          } else {
            update({ streaming: false });
          }
        } finally {
          abortRef.current = null;
          setLoading(false);
        }
        return;
      }

      // ── 3. Gather sources ─────────────────────────────────────
      //   Priority: targetUrl → agent multi-step → auto search/nosearch
      let sources: Source[] = [];
      let pageImages: string[] = []; // base64 images crawled from scraped pages
      const grounded = focusMode === "all" || focusMode === "academic";

      // If the user typed a bare URL as their query (e.g. pasted a YouTube link
      // directly into the search bar), treat it like URL-focus mode so we scrape
      // it for context instead of running a web search that won't help.
      const implicitUrl = !opts.targetUrl ? extractBareUrl(query.trim()) : null;
      const effectiveTargetUrl = opts.targetUrl || implicitUrl || undefined;

      if (effectiveTargetUrl) {
        // URL focus mode: scrape the given page, skip web search entirely.
        const isYT = /youtube\.com|youtu\.be/.test(effectiveTargetUrl);
        const label = isYT ? "Analyzing YouTube video" : `Reading ${urlDomain_(effectiveTargetUrl)}`;
        const readStep = pushStep(label, "active");
        const { sources: scraped, pageImages: urlImages } = await scrape([effectiveTargetUrl]);
        sources = scraped;
        pageImages = urlImages;
        update({ sources });
        setStep(readStep, scraped.length ? "done" : "skipped", scraped.length ? (isYT ? "transcript extracted" : "page loaded") : "could not read page");
      } else if (opts.agent && opts.agentSteps && opts.agentSteps > 0) {
        const planStep = pushStep("Planning research");
        const plan = await agentPlan(query, model, opts.agentSteps);
        setStep(planStep, "done", `${plan.length} searches planned`);

        const collected = new Map<string, Source>();
        for (const sub of plan) {
          const st = pushStep("Searching", "active", sub);
          try {
            const results = (await webSearch(sub)).slice(0, 4);
            if (results.length) {
              const missing = results.filter((r) => !r.content).map((r) => r.url);
              const empty = { sources: [] as Source[], pageImages: [] as string[] };
              const { sources: scraped } = missing.length ? await scrape(missing) : empty;
              for (const src of buildSources(results, scraped)) {
                if (!collected.has(src.url)) collected.set(src.url, src);
              }
              setStep(st, "done", `${results.length} results`);
            } else {
              setStep(st, "skipped", "no results");
            }
          } catch {
            setStep(st, "error", "search failed");
          }
          sources = [...collected.values()];
          update({ sources });
        }
        const synth = pushStep("Synthesizing answer", "active");
        setStep(synth, "done", `${sources.length} sources`);
      } else if (grounded) {
        const understand = pushStep("Understanding your request");

        let decision: RouteDecision = {
          needsSearch: true,
          searchQuery: query,
          reason: "academic mode",
        };
        if (focusMode === "all") {
          const decide = pushStep("Deciding if a search is needed");
          decision = await routeDecision(query, model, routerHistory);
          setStep(
            decide,
            "done",
            decision.needsSearch ? "Web search needed" : "Answer from knowledge"
          );
        }
        setStep(understand, "done");

        if (decision.needsSearch) {
          const searchStep = pushStep("Searching the web", "active", decision.searchQuery);
          try {
            const results = await webSearch(decision.searchQuery);
            const top = results.slice(0, 5);
            if (top.length) {
              setStep(searchStep, "done", `${top.length} results`);
              const readStep = pushStep("Reading sources", "active");
              const missing = top.filter((r) => !r.content).map((r) => r.url);
              const { sources: scraped, pageImages: srcImages } = missing.length
                ? await scrape(missing)
                : { sources: [], pageImages: [] };
              sources = buildSources(top, scraped);
              pageImages = srcImages;
              update({ sources });
              setStep(readStep, "done", `${sources.length} sources`);
            } else {
              setStep(searchStep, "skipped", "No results found");
            }
          } catch {
            setStep(searchStep, "error", "Search unavailable");
            setSearchWarning(
              "Web search is unavailable — answering from the model's knowledge only."
            );
          }
        } else {
          pushStep("Web search", "skipped", decision.reason);
        }
      }

      if (imageAnalysisStep) setStep(imageAnalysisStep, "done", "image understood");

      const writeStep = pushStep("Writing answer");

      // 4. Use the pre-captured history snapshot (no duplicate current query).
      const history = historySnapshot;

      // 5. Stream the answer
      const controller = new AbortController();
      abortRef.current = controller;

      // Augment query with board state when a chess game is active so the
      // model knows the current position before emitting a move directive.
      const baseQuery = isChessOpen
        ? `[Chess board FEN: ${chessFen}]\n${query}`
        : query;

      // Fold attachments in: inline text files, collect images for vision
      // models, and note anything the chosen model can't consume.
      const built = buildAttachments(baseQuery, attachments, attachmentCaps);
      // Prepend the current sandbox project so edit requests modify it in place
      // (sent to the model only — not shown in the user's chat bubble).
      const effectiveQuery = existingProject
        ? `${computerContext(existingProject)}\n\n${built.query}`
        : built.query;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: effectiveQuery,
            threadHistory: history,
            model,
            focusMode,
            sources,
            images: (() => {
              // Merge user-uploaded images with images crawled from pages.
              // Only send to vision-capable models; cap total to avoid huge payloads.
              const all = attachmentCaps.vision
                ? [...built.images, ...pageImages].slice(0, 8)
                : built.images;
              return all.length ? all : undefined;
            })(),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          // Free-tier usage limit (429) returns a JSON message; nudge to upgrade.
          if (res.status === 429) {
            const data = await res.json().catch(() => null);
            update({
              streaming: false,
              error: data?.error || "You've reached your free usage limit. Upgrade to continue.",
            });
            store.getState().setPricingOpen(true);
            return;
          }
          const text = await res.text().catch(() => "");
          update({ streaming: false, error: text || "Chat request failed." });
          return;
        }

        // If the user attached an image this turn, use it as the basis for
        // image-to-image; otherwise it's plain text-to-image.
        const srcAtt = attachments.find((a) => a.kind === "image" && a.data);
        const sourceImageUrl = srcAtt
          ? `data:${srcAtt.mime || "image/png"};base64,${srcAtt.data}`
          : null;

        // Kick off image generation for an emitted [[image: …]] prompt.
        const startImage = (prompt: string) => {
          const imgId = uid();
          const cur =
            store.getState().getThread(threadId)?.messages.find((m) => m.id === assistantId)
              ?.generatedImages ?? [];
          update({ generatedImages: [...cur, { id: imgId, prompt, status: "loading" }] });

          const patch = (fn: (g: GeneratedImage) => GeneratedImage) => {
            const arr =
              store.getState().getThread(threadId)?.messages.find((m) => m.id === assistantId)
                ?.generatedImages ?? [];
            store.getState().updateMessage(threadId, assistantId, {
              generatedImages: arr.map((g) => (g.id === imgId ? fn(g) : g)),
            });
          };

          // Image-to-image when a source image is present; fall back to plain
          // text-to-image if native img2img isn't available.
          const run = sourceImageUrl
            ? editImage(prompt, sourceImageUrl).catch(() => generateImage(prompt))
            : generateImage(prompt);

          run
            .then((url) => {
              patch((g) => ({ ...g, url, status: "done" }));
              syncThread(threadId);
            })
            .catch((e) => {
              patch((g) => ({ ...g, status: "error", error: (e as Error).message }));
              syncThread(threadId);
            });
        };

        let acc = "";
        let artifactOpened = false;
        let chessColor: PlayerColor | null = null;
        let chessMoveDispatched = false;
        let dispatchedImages = 0;
        // Builder artifacts (Computer/Website/Slides/Spreadsheet) — shared logic.
        const buildState = makeBuildState(opts, existingProject);
        await readSse(res.body, (evt) => {
          if (evt.type === "token") {
            acc += evt.content;

            // Detect & stream Computer/Website/Slides/Spreadsheet artifacts.
            detectBuilds(acc, buildState);

            // Open chess board directive
            const dir = parseArtifactDirective(acc);
            if (dir && !artifactOpened) {
              artifactOpened = true;
              chessColor = dir.playerColor;
              store.getState().openArtifact({
                type: "chess",
                title: "Chess",
                playerColor: dir.playerColor,
              });
            }

            // Chess move directive — chatbot plays a move on the board
            if (!chessMoveDispatched) {
              const mv = parseChessMoveDirective(acc);
              if (mv) {
                chessMoveDispatched = true;
                store.getState().setPendingChessMove(mv);
              }
            }

            // Image generation directives (Pro/Max only) — fire each new one as
            // it completes. Free-tier callers can't generate, so any stray
            // directive is just stripped from the visible text below.
            if (opts.imageGen) {
              const imgPrompts = parseImageDirectives(acc);
              for (let i = dispatchedImages; i < imgPrompts.length; i++) {
                startImage(imgPrompts[i]);
              }
              dispatchedImages = Math.max(dispatchedImages, imgPrompts.length);
            }

            update({ content: stripDirectives(acc) });
          } else if (evt.type === "followups") {
            update({ followups: evt.questions });
          } else if (evt.type === "error") {
            update({ streaming: false, error: evt.message });
          }
        });

        if (!artifactOpened && chessHint) {
          chessColor = chessHint.playerColor;
          store.getState().openArtifact({
            type: "chess",
            title: "Chess",
            playerColor: chessHint.playerColor,
          });
        }

        setStep(writeStep, "done");
        update({ streaming: false });

        // Leave a resume card on the message when a chess game was opened.
        if (chessColor) update({ chess: { playerColor: chessColor } });

        // Finalize builder artifacts (Computer/Website/Slides/Spreadsheet): persist
        // snapshots on the message and run the sandbox terminal if one was built.
        const artifacts = finalizeBuilds(acc, buildState, existingProject?.commands);
        if (Object.keys(artifacts.patch).length) update(artifacts.patch);
        if (artifacts.computer) void runComputerTerminal(artifacts.computer.files, artifacts.computer.commands);

        // Generate a smart AI title after the very first response in a thread.
        const finishedThread = store.getState().getThread(threadId);
        if (finishedThread && finishedThread.messages.filter((m) => m.role === "assistant" && m.content).length === 1) {
          generateTitle(query, model).then((t) => {
            if (t) store.getState().updateThreadTitle(threadId, t);
          });
        }

        syncThread(threadId);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          update({
            streaming: false,
            error: "Connection to Ollama Cloud was interrupted.",
          });
        } else {
          update({ streaming: false });
        }
      } finally {
        abortRef.current = null;
        setLoading(false);
      }
    },
    [threadId, loading, store]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { send, stop, loading, searchWarning };
}

// ─── helpers ──────────────────────────────────────────────────

function makeMsg(
  role: Message["role"],
  content: string,
  extra: Partial<Message> = {}
): Message {
  return { id: uid(), role, content, createdAt: Date.now(), ...extra };
}

interface ChessIntent {
  playerColor: PlayerColor;
  difficulty?: number;
}

/**
 * Detect a genuine "let's play chess" request (not "explain chess history").
 * Also picks up the desired side and an easy/hard hint.
 */
function detectChessIntent(query: string): ChessIntent | null {
  const s = query.toLowerCase();
  if (!/\bchess\b/.test(s)) return null;

  const wantsPlay =
    /\b(play|let'?s|lets|start|begin|new game|match|rematch|challenge|wanna|up for|game of)\b/.test(
      s
    );
  if (!wantsPlay) return null;

  // Skip informational queries that merely mention chess.
  if (
    /\b(history|rules?|how (to|do|does)|explain|origin|who invented|notation|opening theory|strategy guide|meaning)\b/.test(
      s
    )
  )
    return null;

  const playerColor: PlayerColor = /\bblack\b/.test(s) ? "black" : "white";

  let difficulty: number | undefined;
  if (/\b(easy|easier|beginner|gentle|simple|go easy)\b/.test(s)) difficulty = 2;
  else if (/\b(hard|harder|difficult|expert|strong|master|tough|brutal)\b/.test(s))
    difficulty = 9;

  return { playerColor, difficulty };
}

const ARTIFACT_RE = /\[\[artifact:chess:(white|black)\]\]/i;
const CHESS_MOVE_RE = /\[\[chess:move:([a-h][1-8][a-h][1-8][qrbn]?)\]\]/i;
const IMAGE_RE = /\[\[image:\s*([\s\S]+?)\]\]/i;

/** Extract every completed image directive's prompt, in order. */
function parseImageDirectives(text: string): string[] {
  const re = new RegExp(IMAGE_RE.source, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const p = m[1].trim();
    if (p) out.push(p);
  }
  return out;
}

/** Detect a completed chess artifact directive in the accumulated stream. */
function parseArtifactDirective(
  text: string
): { playerColor: PlayerColor } | null {
  const m = text.match(ARTIFACT_RE);
  return m ? { playerColor: m[1].toLowerCase() as PlayerColor } : null;
}

/** Detect a chess move directive (UCI notation). */
function parseChessMoveDirective(text: string): string | null {
  const m = text.match(CHESS_MOVE_RE);
  return m ? m[1].toLowerCase() : null;
}

/** Remove all directives (and any partial still-streaming ones) from visible text. */
function stripDirectives(text: string): string {
  return stripWebsiteSyntax(
    stripSheetSyntax(
      stripSlidesSyntax(
        stripComputerSyntax(
          text
            .replace(new RegExp(ARTIFACT_RE.source, "gi"), "")
            .replace(new RegExp(CHESS_MOVE_RE.source, "gi"), "")
            .replace(new RegExp(IMAGE_RE.source, "gi"), "")
        )
      )
    )
  )
    .replace(/\[\[[^\]]*$/i, "") // trailing partial directive mid-stream
    .replace(/^\s+/, "");
}

/** Generate a concise AI title for the thread after the first response. */
async function generateTitle(query: string, model: string): Promise<string> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `Give a SHORT title (3-5 words, no punctuation) for a conversation that starts with: "${query.slice(0, 200)}"`,
        threadHistory: [],
        model,
        focusMode: "nosearch",
        sources: [],
        internal: true,
      }),
    });
    if (!res.ok || !res.body) return "";
    let title = "";
    await readSse(res.body, (evt) => {
      if (evt.type === "token") title += evt.content;
    });
    return title.trim().replace(/^["']|["']$/g, "").slice(0, 60) || "";
  } catch {
    return "";
  }
}

/**
 * Ask the backend router whether this query needs a live web search.
 * Fails open (defaults to searching) so a router hiccup never drops grounding.
 */
async function routeDecision(
  query: string,
  model: string,
  history: { role: string; content: string }[]
): Promise<RouteDecision> {
  try {
    const res = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, model, history }),
    });
    if (!res.ok) throw new Error("route failed");
    return (await res.json()) as RouteDecision;
  } catch {
    return { needsSearch: true, searchQuery: query, reason: "router unavailable" };
  }
}

/** Ask the agent planner for a list of focused search sub-queries. */
async function agentPlan(
  goal: string,
  model: string,
  maxSteps: number
): Promise<string[]> {
  try {
    const res = await fetch("/api/agent/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, model, maxSteps }),
    });
    if (!res.ok) throw new Error("plan failed");
    const data = await res.json();
    const steps = Array.isArray(data?.steps) ? (data.steps as string[]) : [];
    return steps.length ? steps.slice(0, maxSteps) : [goal];
  } catch {
    return [goal];
  }
}

async function webSearch(query: string): Promise<SearchResult[]> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error("search failed");
  const data = await res.json();
  if (data.unavailable) throw new Error("unavailable");
  return data.results ?? [];
}

async function scrape(urls: string[]): Promise<{ sources: Source[]; pageImages: string[] }> {
  const res = await fetch("/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) return { sources: [], pageImages: [] };
  const data = await res.json();
  return { sources: data.sources ?? [], pageImages: data.pageImages ?? [] };
}

/**
 * Build sources in search-result order, preferring content the search backend
 * already returned (Ollama web search), then any scraped fallback, then snippet.
 */
function buildSources(results: SearchResult[], scraped: Source[]): Source[] {
  const byUrl = new Map(scraped.map((s) => [s.url, s]));
  return results.map((r) => {
    const s = byUrl.get(r.url);
    return {
      url: r.url,
      title: r.title || s?.title || r.url,
      content: r.content || s?.content || r.snippet,
      snippet: r.snippet,
    };
  });
}

function syncThread(threadId: string) {
  const thread = useKodaStore.getState().getThread(threadId);
  if (!thread) return;
  fetch("/api/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread }),
  }).catch(() => {});
}

function urlDomain_(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 30); }
}

/** The most recent Koda's Computer project saved in this thread, if any. */
function latestComputerSnapshot(
  thread: { messages: Message[] } | undefined
): { title: string; files: ProjectFile[]; commands: string[] } | null {
  if (!thread) return null;
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const c = thread.messages[i].computer;
    if (c && c.files?.length) return c;
  }
  return null;
}

/** Render the current project as context so the model edits it (not recreates). */
function computerContext(project: { title: string; files: ProjectFile[] }): string {
  const files = project.files
    .map((f) => `<koda-file path="${f.path}">\n${f.content}\n</koda-file>`)
    .join("\n");
  return `[Koda's Computer — current project "${project.title}". The user is iterating on this existing project. Apply only the requested change on top of these files and re-emit the changed files; do not start a new project.]\n${files}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drive the sandbox terminal: replay the build/install/run commands with a bit
 * of realistic output so the user sees the project "execute", then flip to the
 * live preview. Purely cosmetic — the actual preview runs in the iframe.
 */
async function runComputerTerminal(files: ProjectFile[], commands: string[]) {
  const st = useKodaStore.getState();
  if (!st.computer) return;
  const term = (line: string) => useKodaStore.getState().appendComputerTerminal(line);
  const status = (s: Parameters<typeof st.setComputerStatus>[0]) =>
    useKodaStore.getState().setComputerStatus(s);

  const react = isReactProject(files);
  const cmds = commands.length
    ? commands
    : react
    ? ["npm install", "npm run dev"]
    : ["open index.html"];

  term(`koda@sandbox:~/${slug(st.computer.title)}$ ls`);
  term(files.map((f) => f.path.split("/")[0]).filter((v, i, a) => a.indexOf(v) === i).join("  "));
  await sleep(250);

  for (const cmd of cmds) {
    term(`koda@sandbox:~/${slug(st.computer.title)}$ ${cmd}`);
    await sleep(300);
    if (/install|^npm i\b|pnpm|yarn/.test(cmd)) {
      status("installing");
      term("⠙ resolving packages…");
      await sleep(450);
      const dep = react ? "react, react-dom, vite" : "dependencies";
      term(`added ${react ? 142 : 0 + files.length} packages (${dep})`);
      await sleep(200);
    } else if (/dev|start|serve|vite|preview/.test(cmd)) {
      status("running");
      await sleep(350);
      term("");
      term("  VITE v5.2.0  ready in 312 ms");
      term("");
      term("  ➜  Local:   http://localhost:5173/");
      term("  ➜  press h to show help");
      await sleep(300);
    } else {
      await sleep(200);
      term("done");
    }
  }
  status("ready");
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "project";
}

/**
 * If the entire query is a bare URL (possibly followed by whitespace), return
 * it so it can be treated as an implicit URL-focus request rather than a search.
 */
function extractBareUrl(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;
  // Only treat as a bare URL if the query IS the URL (no prose around it)
  if (/\s/.test(trimmed)) return null;
  try { new URL(trimmed); return trimmed; } catch { return null; }
}

/** Parse an SSE stream of SwarmStreamEvent JSON payloads. */
async function readSwarmSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: SwarmStreamEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        try { onEvent(JSON.parse(payload) as SwarmStreamEvent); } catch { /* ignore */ }
      }
    }
  }
}

/** Parse an SSE stream of ChatStreamEvent JSON payloads. */
async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: ChatStreamEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        try {
          onEvent(JSON.parse(payload) as ChatStreamEvent);
        } catch {
          /* ignore malformed event */
        }
      }
    }
  }
}
