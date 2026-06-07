import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Artifact,
  Attachment,
  ComputerProject,
  ComputerStatus,
  FocusMode,
  Message,
  ProjectFile,
  Slide,
  SlideDeck,
  SheetTable,
  Workbook,
  WebsiteProject,
  Thread,
} from "@/types";
import { uid, titleFromQuery } from "@/lib/utils";

/** Choose the most interesting file to show first (prefer App, then entry). */
function pickActiveFile(files: ProjectFile[]): string | undefined {
  if (!files.length) return undefined;
  const pref = [/src\/App\.(jsx|tsx|js|ts)$/i, /App\.(jsx|tsx)$/i, /index\.html$/i, /\.(jsx|tsx)$/i];
  for (const re of pref) {
    const hit = files.find((f) => re.test(f.path));
    if (hit) return hit.path;
  }
  return files[0].path;
}

interface KodaState {
  // ─── Model ──────────────────────────────────────────────
  selectedModel: string;
  availableModels: string[];
  setSelectedModel: (m: string) => void;
  setAvailableModels: (models: string[]) => void;

  // ─── Focus ──────────────────────────────────────────────
  focusMode: FocusMode;
  setFocusMode: (m: FocusMode) => void;

  /** Autonomous multi-step research agent toggle (Pro/Max). */
  agentMode: boolean;
  setAgentMode: (v: boolean) => void;

  /** Agent Swarm mode — runs parallel specialists (Pro/Max). */
  swarmMode: boolean;
  setSwarmMode: (v: boolean) => void;

  /** Optional URL to focus on instead of searching the web. */
  targetUrl: string;
  setTargetUrl: (url: string) => void;

  /**
   * Attachments staged on the home screen, handed off to the thread page after
   * navigation (which sends them with the initial query). Transient, not persisted.
   */
  pendingAttachments: Attachment[];
  setPendingAttachments: (a: Attachment[]) => void;

  /**
   * Text to seed the composer with (e.g. from the "Ask Koda AI" selection
   * popover). SearchBar picks it up, fills the input, and clears it.
   */
  composerDraft: string;
  setComposerDraft: (text: string) => void;

  // ─── Settings ───────────────────────────────────────────
  /** Chess engine strength, 1 (easy) … 10 (hard). */
  chessDifficulty: number;
  setChessDifficulty: (n: number) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  pricingOpen: boolean;
  setPricingOpen: (v: boolean) => void;

  /** Show the dictation (mic) button in the composer. */
  dictationEnabled: boolean;
  setDictationEnabled: (v: boolean) => void;
  /** Preferred dictation language (BCP-47, e.g. "en-US"); "" = auto-detect. */
  dictationLang: string;
  setDictationLang: (v: string) => void;

  /** Spotlight-style thread search palette. */
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;

  /** Library modal — upload history across chats. */
  libraryOpen: boolean;
  setLibraryOpen: (v: boolean) => void;

  // ─── Artifacts (Claude-style side panel) ────────────────
  artifact: Artifact | null;
  openArtifact: (a: Artifact) => void;
  closeArtifact: () => void;

  /**
   * A move the chatbot has asked to play on behalf of the user.
   * UCI format (e.g. "e2e4") or SAN (e.g. "e4").
   * ChessArtifact watches this and clears it after executing.
   */
  pendingChessMove: string | null;
  setPendingChessMove: (move: string | null) => void;

  /** Current board FEN — kept in sync by ChessArtifact so useChat can inject it. */
  chessFen: string;
  setChessFen: (fen: string) => void;

  // ─── Koda's Computer (sandboxed project workspace) ──────────
  // Transient only: never persisted, never written to thread history, so a
  // sandbox can't be shared into or leak across other chats.
  computer: ComputerProject | null;
  openComputer: (title: string) => void;
  /** Re-open the panel for the live sandbox (from the chat card). */
  reopenComputer: () => void;
  /** Restore a sandbox from a saved snapshot (chat card) and open the panel. */
  loadComputer: (snapshot: { title: string; files: ProjectFile[]; commands: string[] }) => void;
  /** Discard the sandbox entirely (on thread switch). */
  resetComputer: () => void;

  // ─── Slides (presentation generator) ────────────────────────
  slides: SlideDeck | null;
  openSlides: (title: string) => void;
  setSlides: (slides: Slide[]) => void;
  setSlidesStatus: (status: SlideDeck["status"]) => void;
  setSlidesTemplate: (template: string) => void;
  /** Restore a deck from a saved snapshot (chat card) and open the panel. */
  loadSlides: (snapshot: { title: string; slides: Slide[]; template?: string }) => void;
  reopenSlides: () => void;
  resetSlides: () => void;

  // ─── Spreadsheets (Excel generator) ─────────────────────────
  workbook: Workbook | null;
  openWorkbook: (title: string) => void;
  setWorkbookSheets: (sheets: SheetTable[]) => void;
  setWorkbookStatus: (status: Workbook["status"]) => void;
  loadWorkbook: (snapshot: { title: string; sheets: SheetTable[] }) => void;
  reopenWorkbook: () => void;
  resetWorkbook: () => void;

  // ─── Website builder (static sites, all tiers) ──────────────
  website: WebsiteProject | null;
  openWebsite: (title: string) => void;
  setWebsiteFiles: (files: ProjectFile[]) => void;
  setWebsiteStatus: (status: WebsiteProject["status"]) => void;
  loadWebsite: (snapshot: { title: string; files: ProjectFile[] }) => void;
  reopenWebsite: () => void;
  resetWebsite: () => void;
  setComputerFiles: (files: ProjectFile[]) => void;
  setComputerCommands: (commands: string[]) => void;
  appendComputerTerminal: (line: string) => void;
  setComputerStatus: (status: ComputerStatus, error?: string) => void;
  setComputerActiveFile: (path: string) => void;

  // ─── External call counter (privacy dashboard) ──────────
  externalCalls: number;
  incExternalCalls: (n?: number) => void;

  // ─── Threads ────────────────────────────────────────────
  threads: Thread[];
  activeThreadId: string | null;
  setThreads: (threads: Thread[]) => void;
  createThread: (query: string) => string;
  updateThreadTitle: (threadId: string, title: string) => void;
  setActiveThread: (id: string | null) => void;
  appendMessage: (threadId: string, message: Message) => void;
  updateMessage: (
    threadId: string,
    messageId: string,
    patch: Partial<Message>
  ) => void;
  deleteThread: (id: string) => void;
  /** Remove a message and everything after it (for edit / regenerate). */
  deleteMessagesFrom: (threadId: string, messageId: string) => void;
  getThread: (id: string) => Thread | undefined;
}

export const useKodaStore = create<KodaState>()(
  persist(
    (set, get) => ({
      selectedModel: "",
      availableModels: [],
      setSelectedModel: (m) => set({ selectedModel: m }),
      setAvailableModels: (models) =>
        set((s) => ({
          availableModels: models,
          // Keep the current selection if it's still valid (or the "auto"
          // sentinel); otherwise auto-pick the first available model.
          selectedModel:
            s.selectedModel === "auto" ||
            (s.selectedModel && models.includes(s.selectedModel))
              ? s.selectedModel
              : models[0] ?? s.selectedModel,
        })),

      focusMode: "all",
      setFocusMode: (m) => set({ focusMode: m }),

      agentMode: false,
      setAgentMode: (v) => set({ agentMode: v }),

      swarmMode: false,
      setSwarmMode: (v) => set({ swarmMode: v }),

      targetUrl: "",
      setTargetUrl: (url) => set({ targetUrl: url }),

      pendingAttachments: [],
      setPendingAttachments: (a) => set({ pendingAttachments: a }),

      composerDraft: "",
      setComposerDraft: (text) => set({ composerDraft: text }),

      chessDifficulty: 5,
      setChessDifficulty: (n) =>
        set({ chessDifficulty: Math.max(1, Math.min(10, Math.round(n))) }),
      settingsOpen: false,
      setSettingsOpen: (v) => set({ settingsOpen: v }),
      pricingOpen: false,
      setPricingOpen: (v) => set({ pricingOpen: v }),

      dictationEnabled: true,
      setDictationEnabled: (v) => set({ dictationEnabled: v }),
      dictationLang: "",
      setDictationLang: (v) => set({ dictationLang: v }),

      searchOpen: false,
      setSearchOpen: (v) => set({ searchOpen: v }),

      libraryOpen: false,
      setLibraryOpen: (v) => set({ libraryOpen: v }),

      artifact: null,
      openArtifact: (a) => set({ artifact: a }),
      // Closing only hides the panel. A computer sandbox stays in memory so the
      // chat's re-open card can bring it back; it's discarded on thread change.
      closeArtifact: () => set({ artifact: null }),

      pendingChessMove: null,
      setPendingChessMove: (move) => set({ pendingChessMove: move }),

      chessFen: "",
      setChessFen: (fen) => set({ chessFen: fen }),

      computer: null,
      openComputer: (title) =>
        set({
          artifact: { type: "computer", title },
          computer: {
            title,
            files: [],
            commands: [],
            terminal: [],
            status: "building",
          },
        }),
      setComputerFiles: (files) =>
        set((s) => {
          if (!s.computer) return s;
          // Keep the active file pointed at something sensible as files arrive.
          const activePath =
            s.computer.activePath && files.some((f) => f.path === s.computer!.activePath)
              ? s.computer.activePath
              : pickActiveFile(files);
          return { computer: { ...s.computer, files, activePath } };
        }),
      setComputerCommands: (commands) =>
        set((s) => (s.computer ? { computer: { ...s.computer, commands } } : s)),
      appendComputerTerminal: (line) =>
        set((s) =>
          s.computer
            ? { computer: { ...s.computer, terminal: [...s.computer.terminal, line] } }
            : s
        ),
      setComputerStatus: (status, error) =>
        set((s) => (s.computer ? { computer: { ...s.computer, status, error } } : s)),
      setComputerActiveFile: (path) =>
        set((s) => (s.computer ? { computer: { ...s.computer, activePath: path } } : s)),
      reopenComputer: () =>
        set((s) =>
          s.computer ? { artifact: { type: "computer", title: s.computer.title } } : s
        ),
      loadComputer: (snapshot) =>
        set({
          artifact: { type: "computer", title: snapshot.title },
          computer: {
            title: snapshot.title,
            files: snapshot.files,
            commands: snapshot.commands,
            terminal: ["✓ Restored sandbox from this chat — no rebuild needed."],
            status: "ready",
            activePath: pickActiveFile(snapshot.files),
          },
        }),
      resetComputer: () => set({ computer: null, artifact: null }),

      slides: null,
      openSlides: (title) =>
        set({
          artifact: { type: "slides", title },
          slides: { title, slides: [], status: "building", template: "midnight" },
        }),
      setSlides: (slides) =>
        set((s) => (s.slides ? { slides: { ...s.slides, slides } } : s)),
      setSlidesStatus: (status) =>
        set((s) => (s.slides ? { slides: { ...s.slides, status } } : s)),
      setSlidesTemplate: (template) =>
        set((s) => (s.slides ? { slides: { ...s.slides, template } } : s)),
      loadSlides: (snapshot) =>
        set({
          artifact: { type: "slides", title: snapshot.title },
          slides: {
            title: snapshot.title,
            slides: snapshot.slides,
            status: "ready",
            template: snapshot.template ?? "midnight",
          },
        }),
      reopenSlides: () =>
        set((s) =>
          s.slides ? { artifact: { type: "slides", title: s.slides.title } } : s
        ),
      resetSlides: () => set({ slides: null }),

      workbook: null,
      openWorkbook: (title) =>
        set({
          artifact: { type: "sheet", title },
          workbook: { title, sheets: [], status: "building" },
        }),
      setWorkbookSheets: (sheets) =>
        set((s) => (s.workbook ? { workbook: { ...s.workbook, sheets } } : s)),
      setWorkbookStatus: (status) =>
        set((s) => (s.workbook ? { workbook: { ...s.workbook, status } } : s)),
      loadWorkbook: (snapshot) =>
        set({
          artifact: { type: "sheet", title: snapshot.title },
          workbook: { title: snapshot.title, sheets: snapshot.sheets, status: "ready" },
        }),
      reopenWorkbook: () =>
        set((s) =>
          s.workbook ? { artifact: { type: "sheet", title: s.workbook.title } } : s
        ),
      resetWorkbook: () => set({ workbook: null }),

      website: null,
      openWebsite: (title) =>
        set({
          artifact: { type: "website", title },
          website: { title, files: [], status: "building" },
        }),
      setWebsiteFiles: (files) =>
        set((s) => (s.website ? { website: { ...s.website, files } } : s)),
      setWebsiteStatus: (status) =>
        set((s) => (s.website ? { website: { ...s.website, status } } : s)),
      loadWebsite: (snapshot) =>
        set({
          artifact: { type: "website", title: snapshot.title },
          website: { title: snapshot.title, files: snapshot.files, status: "ready" },
        }),
      reopenWebsite: () =>
        set((s) =>
          s.website ? { artifact: { type: "website", title: s.website.title } } : s
        ),
      resetWebsite: () => set({ website: null }),

      externalCalls: 0,
      incExternalCalls: (n = 1) =>
        set((s) => ({ externalCalls: s.externalCalls + n })),

      threads: [],
      activeThreadId: null,

      setThreads: (threads) => set({ threads }),

      createThread: (query) => {
        const id = uid();
        const now = Date.now();
        const thread: Thread = {
          id,
          title: titleFromQuery(query),
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          threads: [thread, ...s.threads],
          activeThreadId: id,
        }));
        return id;
      },

      updateThreadTitle: (threadId, title) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === threadId ? { ...t, title } : t
          ),
        })),

      setActiveThread: (id) => set({ activeThreadId: id }),

      appendMessage: (threadId, message) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: [...t.messages, message],
                  updatedAt: Date.now(),
                }
              : t
          ),
        })),

      updateMessage: (threadId, messageId, patch) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === messageId ? { ...m, ...patch } : m
                  ),
                  updatedAt: Date.now(),
                }
              : t
          ),
        })),

      deleteThread: (id) =>
        set((s) => ({
          threads: s.threads.filter((t) => t.id !== id),
          activeThreadId: s.activeThreadId === id ? null : s.activeThreadId,
        })),

      deleteMessagesFrom: (threadId, messageId) =>
        set((s) => ({
          threads: s.threads.map((t) => {
            if (t.id !== threadId) return t;
            const i = t.messages.findIndex((m) => m.id === messageId);
            if (i < 0) return t;
            return { ...t, messages: t.messages.slice(0, i), updatedAt: Date.now() };
          }),
        })),

      getThread: (id) => get().threads.find((t) => t.id === id),
    }),
    {
      name: "kodaai-store",
      // Bump when the persisted shape changes; `migrate` scrubs old data.
      version: 1,
      // Don't persist transient/server-derived state.
      //
      // SECURITY: threads are deliberately NOT persisted to localStorage. They
      // are per-user data fetched from the server on auth. Persisting them here
      // would leak one user's chats to the next person who signs in on the same
      // browser (the store survives logout/login). The server is the single
      // source of truth; the client loads them fresh per session.
      partialize: (s) => ({
        selectedModel: s.selectedModel,
        focusMode: s.focusMode,
        chessDifficulty: s.chessDifficulty,
        externalCalls: s.externalCalls,
        dictationEnabled: s.dictationEnabled,
        dictationLang: s.dictationLang,
      }),
      // Strip any chats persisted by older builds so they can't rehydrate and
      // leak across users on a shared browser.
      migrate: (persisted) => {
        if (persisted && typeof persisted === "object") {
          const p = persisted as Record<string, unknown>;
          delete p.threads;
          delete p.activeThreadId;
          return p as unknown as KodaState;
        }
        return persisted as KodaState;
      },
    }
  )
);
