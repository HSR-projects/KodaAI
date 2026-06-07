"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound, Plus, Copy, Check, Trash2, Loader2, Coins, Zap, AlertTriangle,
} from "lucide-react";
import type { ApiKeyPublic } from "@/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { Header } from "@/components/layout/Header";
import { CREDIT_PACKS, formatCredits, API_CENTS_PER_1K } from "@/lib/credits";
import { relativeTime } from "@/lib/utils";

export default function DevelopersPage() {
  const router = useRouter();
  const { user, loading: authLoading, refresh } = useAuth();

  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const res = await fetch("/api/account/api-keys", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setKeys(data.keys ?? []);
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadKeys();
  }, [user, loadKeys]);

  const createKey = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || "Default key" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create key.");
      setRevealed(data.secret);
      setNewName("");
      await loadKeys();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    await fetch(`/api/account/api-keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    loadKeys();
  };

  const buyCredits = async (packId: string) => {
    setBuying(packId);
    setError(null);
    try {
      const res = await fetch("/api/stripe/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout.");
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setBuying(null);
    }
  };

  const copySecret = () => {
    if (!revealed) return;
    navigator.clipboard.writeText(revealed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (!authLoading && !user) {
    return (
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <KeyRound className="h-10 w-10 text-koda-accent" />
          <p className="text-koda-text">Sign in to manage API keys and credits.</p>
          <button
            onClick={() => router.push("/")}
            className="rounded-xl bg-koda-accent px-5 py-2 text-sm font-semibold text-black hover:bg-koda-accent-soft"
          >
            Go home
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header title="Developers" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-koda-text">
            API &amp; Credits
          </h1>
          <p className="mt-1 text-sm text-koda-muted">
            Programmatic access to KodaAI, billed pay-as-you-go from prepaid credits.
            Independent of your subscription plan.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* ── Credit balance ── */}
        <section className="mb-8 rounded-2xl border border-koda-border bg-koda-surface p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-koda-accent/15">
                <Coins className="h-5 w-5 text-koda-accent" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-koda-muted">Credit balance</p>
                <p className="text-2xl font-semibold text-koda-text">
                  {formatCredits(user?.credits ?? 0)}
                </p>
              </div>
            </div>
            <p className="hidden text-right text-xs text-koda-muted sm:block">
              ~{API_CENTS_PER_1K}¢ / 1K tokens<br />Credits never expire
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.id}
                onClick={() => buyCredits(pack.id)}
                disabled={!!buying}
                className="relative flex flex-col items-center gap-1 rounded-xl border border-koda-border bg-koda-surface-2 px-3 py-3 transition-colors hover:border-koda-accent/50 hover:bg-koda-surface disabled:opacity-60"
              >
                {pack.note && (
                  <span className="absolute -top-2 rounded-full bg-koda-accent px-2 py-0.5 text-[10px] font-semibold text-black">
                    {pack.note}
                  </span>
                )}
                <span className="text-lg font-semibold text-koda-text">${pack.usd}</span>
                <span className="text-xs text-koda-muted">{pack.credits} credits</span>
                {buying === pack.id && (
                  <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-koda-accent" />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => refresh()}
            className="mt-3 text-xs text-koda-muted hover:text-koda-text"
          >
            Refresh balance
          </button>
        </section>

        {/* ── API keys ── */}
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-koda-text">
            <KeyRound className="h-4 w-4 text-koda-accent" /> API keys
          </h2>

          {revealed && (
            <div className="mb-4 rounded-xl border border-koda-accent/40 bg-koda-accent/10 p-4">
              <p className="mb-2 text-xs font-medium text-koda-accent-soft">
                Copy your key now — you won&apos;t be able to see it again.
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-koda-bg/60 px-3 py-2">
                <code className="flex-1 truncate font-mono text-xs text-koda-text">{revealed}</code>
                <button
                  onClick={copySecret}
                  className="flex items-center gap-1 rounded-md bg-koda-surface-2 px-2 py-1 text-xs text-koda-text hover:bg-koda-surface"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button
                onClick={() => setRevealed(null)}
                className="mt-2 text-xs text-koda-muted hover:text-koda-text"
              >
                Done
              </button>
            </div>
          )}

          <div className="mb-3 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createKey()}
              placeholder="Key name (e.g. production)"
              className="flex-1 rounded-lg border border-koda-border bg-koda-surface px-3 py-2 text-sm text-koda-text placeholder:text-koda-muted focus:border-koda-accent/50 focus:outline-none"
            />
            <button
              onClick={createKey}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-koda-accent px-3.5 py-2 text-sm font-medium text-black hover:bg-koda-accent-soft disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </button>
          </div>

          <div className="divide-y divide-koda-border overflow-hidden rounded-xl border border-koda-border bg-koda-surface">
            {keysLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-koda-muted" />
              </div>
            ) : keys.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-koda-muted">
                No API keys yet. Create one to start using the API.
              </p>
            ) : (
              keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-koda-text">{k.name}</p>
                    <p className="font-mono text-xs text-koda-muted">
                      sk-koda-…{k.last4} · created {relativeTime(k.createdAt)}
                      {k.lastUsedAt ? ` · last used ${relativeTime(k.lastUsedAt)}` : " · never used"}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeKey(k.id)}
                    aria-label={`Revoke ${k.name}`}
                    className="ml-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-koda-muted hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── Quickstart ── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-koda-text">
            <Zap className="h-4 w-4 text-koda-accent" /> Quickstart
          </h2>
          <pre className="overflow-x-auto rounded-xl border border-koda-border bg-[#141416] p-4 text-xs leading-relaxed text-koda-text/90">
{`curl https://YOUR_DOMAIN/api/v1/chat \\
  -H "Authorization: Bearer sk-koda-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-oss:120b",
    "prompt": "Explain quantum tunneling in one sentence."
  }'

# → { "content": "...", "usage": { "totalTokens": 42,
#       "creditsCharged": 1, "creditsRemaining": 999 } }`}
          </pre>
          <p className="mt-2 text-xs text-koda-muted">
            Send <code className="text-koda-text">prompt</code> for a single turn, or an OpenAI-style{" "}
            <code className="text-koda-text">messages</code> array. Every call is metered by token
            usage and billed from your credit balance.
          </p>
        </section>
      </main>
    </div>
  );
}
