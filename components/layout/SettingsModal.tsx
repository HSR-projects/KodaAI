"use client";

import { useEffect, useState } from "react";
import {
  Settings, Cpu, Loader2, Swords, Check, Lock, Trash2, Palette, AlertTriangle,
  Sparkles, LogOut, Mail, Pencil, UserRound, Crown, Mic, Database, SlidersHorizontal,
} from "lucide-react";
import { useModels } from "@/hooks/useModels";
import { useKodaStore } from "@/lib/store";
import { useAuth } from "@/components/auth/AuthProvider";
import { modelLabel, cn } from "@/lib/utils";
import { AUTO_MODEL } from "@/lib/autoModel";
import { FocusModes } from "@/components/search/FocusModes";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const AVATAR_COLORS = [
  { label: "Violet", value: "#7c3aed" }, { label: "Blue", value: "#2563eb" },
  { label: "Cyan", value: "#0891b2" }, { label: "Green", value: "#16a34a" },
  { label: "Amber", value: "#d97706" }, { label: "Rose", value: "#e11d48" },
  { label: "Pink", value: "#db2777" }, { label: "Slate", value: "#475569" },
];

const SPOKEN_LANGS = [
  { label: "Auto-detect", value: "" },
  { label: "English (US)", value: "en-US" },
  { label: "English (UK)", value: "en-GB" },
  { label: "Hindi", value: "hi-IN" },
  { label: "Spanish", value: "es-ES" },
  { label: "French", value: "fr-FR" },
  { label: "German", value: "de-DE" },
  { label: "Portuguese", value: "pt-BR" },
  { label: "Japanese", value: "ja-JP" },
  { label: "Chinese", value: "zh-CN" },
];

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Beginner", 3: "Casual", 5: "Club", 7: "Strong", 9: "Expert", 10: "Maximum",
};
function difficultyLabel(n: number): string {
  const keys = Object.keys(DIFFICULTY_LABELS).map(Number).sort((a, b) => b - a);
  return DIFFICULTY_LABELS[keys.find((k) => n >= k) ?? 1];
}

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", max: "Max" };

type TabId = "general" | "personalization" | "model" | "game" | "data" | "account";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <SlidersHorizontal className="h-4 w-4" /> },
  { id: "personalization", label: "Personalization", icon: <Palette className="h-4 w-4" /> },
  { id: "model", label: "Model", icon: <Cpu className="h-4 w-4" /> },
  { id: "game", label: "Chess", icon: <Swords className="h-4 w-4" /> },
  { id: "data", label: "Data controls", icon: <Database className="h-4 w-4" /> },
  { id: "account", label: "Account", icon: <UserRound className="h-4 w-4" /> },
];

export function SettingsModal() {
  const { loading } = useModels();
  const { user, caps, updateAccount, deleteAccount, logout } = useAuth();
  const setPricingOpen = useKodaStore((s) => s.setPricingOpen);
  const {
    selectedModel, availableModels, setSelectedModel,
    focusMode, setFocusMode, chessDifficulty, setChessDifficulty,
    settingsOpen, setSettingsOpen,
    dictationEnabled, setDictationEnabled, dictationLang, setDictationLang,
  } = useKodaStore();

  const [tab, setTab] = useState<TabId>("general");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  useEffect(() => setNameDraft(user?.name ?? ""), [user?.name]);

  const sliderValue = Math.min(chessDifficulty, caps.chessMax);

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || name === user?.name) return;
    setSavingName(true); setNameSaved(false);
    try { await updateAccount({ name }); setNameSaved(true); setTimeout(() => setNameSaved(false), 1500); }
    catch { /* silent */ } finally { setSavingName(false); }
  };

  const signOut = async () => {
    try { await logout(); setSettingsOpen(false); } catch { /* silent */ }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true); setDeleteError(null);
    try { await deleteAccount(); setSettingsOpen(false); }
    catch (e) { setDeleteError((e as Error).message); setDeleting(false); }
  };

  const goUpgrade = () => { setSettingsOpen(false); setPricingOpen(true); };

  return (
    <Dialog
      open={settingsOpen}
      onOpenChange={(open) => {
        setSettingsOpen(open);
        if (!open) { setDeleteConfirm(false); setDeleteError(null); }
      }}
    >
      <DialogTrigger asChild>
        <button
          aria-label="Settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-koda-border bg-koda-surface text-koda-muted transition-colors hover:bg-koda-surface-2 hover:text-koda-text"
        >
          <Settings className="h-4 w-4" />
        </button>
      </DialogTrigger>

      <DialogContent className="grid h-[600px] max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-3xl grid-cols-1 gap-0 overflow-hidden p-0 md:grid-cols-[200px_1fr]">
        <DialogTitle className="sr-only">Settings</DialogTitle>

        {/* Left nav */}
        <nav className="hidden flex-col gap-0.5 overflow-y-auto border-r border-koda-border bg-koda-surface/60 p-2 md:flex">
          <p className="px-3 py-2 text-sm font-semibold text-koda-text">Settings</p>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                tab === t.id ? "bg-koda-surface-2 text-koda-text" : "text-koda-muted hover:bg-koda-surface-2/60 hover:text-koda-text"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {/* Mobile tab strip */}
        <div className="flex gap-1 overflow-x-auto border-b border-koda-border p-2 md:hidden [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                tab === t.id ? "bg-koda-surface-2 text-koda-text" : "text-koda-muted"
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
          <h2 className="mb-1 text-lg font-semibold text-koda-text">
            {TABS.find((t) => t.id === tab)?.label}
          </h2>

          {tab === "general" && (
            <div>
              <Row label="Enable dictation" desc="Show the microphone in the chat composer.">
                <Toggle checked={dictationEnabled} onChange={setDictationEnabled} />
              </Row>
              <Row label="Spoken language" desc="Language used for dictation.">
                <Select
                  value={dictationLang}
                  onChange={setDictationLang}
                  options={SPOKEN_LANGS}
                  disabled={!dictationEnabled}
                />
              </Row>
              <Row label="Default search mode" desc="How Koda decides when to search the web.">
                <FocusModes value={focusMode} onChange={setFocusMode} />
              </Row>
            </div>
          )}

          {tab === "personalization" && user && (
            <div>
              <Row label="Display name" desc="Shown on your profile.">
                <div className="flex gap-2">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveName()}
                    maxLength={40}
                    className="w-40 rounded-lg border border-koda-border bg-koda-surface px-3 py-1.5 text-sm text-koda-text focus:border-koda-accent/50 focus:outline-none"
                    placeholder="Your name"
                  />
                  <button
                    onClick={saveName}
                    disabled={savingName || !nameDraft.trim() || nameDraft.trim() === user.name}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-koda-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-koda-accent-soft disabled:opacity-40"
                  >
                    {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : nameSaved ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    {nameSaved ? "Saved" : "Save"}
                  </button>
                </div>
              </Row>
              <Row label="Avatar color" desc="Your profile accent.">
                <div className="flex flex-wrap justify-end gap-2">
                  {AVATAR_COLORS.map((c) => {
                    const active = (user.avatarColor ?? "#7c3aed") === c.value;
                    return (
                      <button
                        key={c.value}
                        title={c.label}
                        onClick={() => updateAccount({ avatarColor: c.value }).catch(() => {})}
                        className={cn("relative h-6 w-6 rounded-full transition-transform hover:scale-110", active && "ring-2 ring-white ring-offset-1 ring-offset-koda-surface")}
                        style={{ backgroundColor: c.value }}
                      >
                        {active && <Check className="absolute inset-0 m-auto h-3 w-3 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </Row>
            </div>
          )}

          {tab === "model" && (
            <div className="pt-2">
              {loading && <p className="mb-2 flex items-center gap-1.5 text-xs text-koda-muted"><Loader2 className="h-3 w-3 animate-spin" /> Loading models…</p>}
              {caps.allModels ? (
                <div className="grid max-h-[420px] gap-1 overflow-y-auto rounded-xl border border-koda-border bg-koda-surface-2 p-1 [scrollbar-width:thin]">
                  <ModelRow active={selectedModel === AUTO_MODEL} onClick={() => setSelectedModel(AUTO_MODEL)} icon={<Sparkles className="h-3.5 w-3.5 text-koda-accent" />} title="Auto" sub="Best model per task" />
                  {availableModels.length === 0 && !loading && (
                    <p className="px-2 py-1.5 text-xs text-koda-muted">No models found — check your Koda AI configuration.</p>
                  )}
                  {availableModels.map((m) => (
                    <ModelRow key={m} active={m === selectedModel} onClick={() => setSelectedModel(m)} title={modelLabel(m)} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-koda-border bg-koda-surface-2 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-koda-text">Auto</p>
                      <p className="text-xs text-koda-muted">{selectedModel ? modelLabel(selectedModel) : "Loading…"}</p>
                    </div>
                    <Lock className="h-4 w-4 text-koda-muted" />
                  </div>
                  <button onClick={goUpgrade} className="mt-2 inline-flex items-center gap-1 text-xs text-koda-accent-soft hover:underline">
                    <Lock className="h-3 w-3" /> Upgrade to Pro to choose any model
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "game" && (
            <div>
              <Row label="Chess strength" desc={`${difficultyLabel(sliderValue)} · ${sliderValue}/${caps.chessMax}`}>
                <div className="w-44">
                  <input
                    type="range" min={1} max={caps.chessMax} step={1} value={sliderValue}
                    onChange={(e) => setChessDifficulty(Number(e.target.value))}
                    className="w-full accent-koda-accent" aria-label="Chess difficulty"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-koda-muted/70"><span>Easy</span><span>Hard</span></div>
                </div>
              </Row>
              {caps.chessMax < 10 && (
                <button onClick={goUpgrade} className="mt-2 inline-flex items-center gap-1 text-xs text-koda-accent-soft hover:underline">
                  <Lock className="h-3 w-3" /> Upgrade for full-strength play
                </button>
              )}
            </div>
          )}

          {tab === "data" && user && (
            <div className="pt-2">
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-red-400">
                  <Trash2 className="h-4 w-4" /> Delete account
                </p>
                {!deleteConfirm ? (
                  <button onClick={() => setDeleteConfirm(true)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20">
                    Delete my account
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-sm text-red-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      <span>This permanently deletes your account and all chat history. This cannot be undone.</span>
                    </div>
                    {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleDeleteAccount} disabled={deleting} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Yes, delete everything
                      </button>
                      <button onClick={() => { setDeleteConfirm(false); setDeleteError(null); }} disabled={deleting} className="rounded-lg border border-koda-border px-3 py-1.5 text-sm text-koda-muted transition-colors hover:bg-koda-surface-2">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "account" && user && (
            <div className="pt-2">
              <div className="flex items-center gap-3 rounded-xl border border-koda-border bg-koda-surface-2 p-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ backgroundColor: user.avatarColor ?? "#7c3aed" }}>
                  {(user.name || user.email || "?").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-koda-text">{user.name || "—"}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-koda-muted"><Mail className="h-3 w-3 shrink-0" /> {user.email}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-koda-accent/30 bg-koda-accent/10 px-2.5 py-1 text-xs font-medium text-koda-accent-soft">
                  <Crown className="h-3 w-3" /> {PLAN_LABEL[user.plan] ?? user.plan}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={goUpgrade} className={cn("inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", user.plan === "free" ? "border border-koda-accent/40 bg-koda-accent/10 text-koda-accent-soft hover:bg-koda-accent/20" : "border border-koda-border bg-koda-surface text-koda-text hover:bg-koda-surface-2")}>
                  {user.plan === "free" ? <><Crown className="h-3.5 w-3.5" /> Upgrade to Pro or Max</> : "Manage plan"}
                </button>
                <button onClick={signOut} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-koda-border bg-koda-surface px-3 py-2 text-sm text-koda-muted transition-colors hover:bg-koda-surface-2 hover:text-koda-text">
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reusable bits ────────────────────────────────────────────

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-koda-border/50 py-4">
      <div className="min-w-0">
        <p className="text-sm text-koda-text">{label}</p>
        {desc && <p className="text-xs text-koda-muted">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-koda-accent" : "bg-koda-surface-2")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

function Select({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[]; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded-lg border border-koda-border bg-koda-surface px-3 py-1.5 text-sm text-koda-text focus:border-koda-accent/50 focus:outline-none disabled:opacity-40"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-koda-surface text-koda-text">{o.label}</option>
      ))}
    </select>
  );
}

function ModelRow({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon?: React.ReactNode; title: string; sub?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors", active ? "bg-koda-accent/15 text-koda-accent-soft" : "text-koda-text hover:bg-koda-surface")}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{title}</span>
          {sub && <span className="text-xs text-koda-muted">{sub}</span>}
        </span>
      </span>
      {active && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}
