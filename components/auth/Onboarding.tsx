"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Loader2,
  Globe,
  Code2,
  GraduationCap,
  Bot,
  Sparkles,
} from "lucide-react";
import type { FocusMode, Plan } from "@/types";
import { useAuth } from "./AuthProvider";
import { useKodaStore } from "@/lib/store";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";

const AGENTS: {
  id: string;
  label: string;
  desc: string;
  icon: typeof Globe;
  focus: FocusMode;
  pro?: boolean;
}[] = [
  { id: "balanced", label: "Balanced", desc: "Searches the web only when needed", icon: Globe, focus: "all" },
  { id: "researcher", label: "Deep Researcher", desc: "Autonomous multi-step research", icon: Bot, focus: "all", pro: true },
  { id: "coder", label: "Coder", desc: "Tuned for programming & artifacts", icon: Code2, focus: "code" },
  { id: "academic", label: "Academic", desc: "Structured, carefully cited", icon: GraduationCap, focus: "academic" },
];

export function Onboarding() {
  const { user, updateAccount, upgrade } = useAuth();
  const setFocusMode = useKodaStore((s) => s.setFocusMode);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.name ?? "");
  const [agent, setAgent] = useState("balanced");
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    const chosen = AGENTS.find((a) => a.id === agent);
    if (chosen) setFocusMode(chosen.focus);
    try {
      await updateAccount({ name: name.trim() || user?.name, onboarded: true, defaultAgent: agent });
    } catch {
      setBusy(false);
    }
  };

  const choosePlan = async (plan: Plan) => {
    if (plan === "free" || plan === user?.plan) return;
    setBusy(true);
    try {
      await upgrade(plan);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="koda-hero-glow flex min-h-dvh items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl rounded-2xl border border-koda-border bg-koda-surface/70 p-6 backdrop-blur-xl sm:p-8"
      >
        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= step ? "bg-koda-accent" : "bg-koda-border"
              )}
            />
          ))}
        </div>

        {step === 0 && (
          <Step
            title={`Welcome${user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋`}
            subtitle="Let's set up Koda AI in a few seconds."
          >
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-koda-muted">
              Display name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-koda-border bg-koda-bg px-3 py-2.5 text-sm text-koda-text placeholder:text-koda-muted/60 focus:border-koda-accent/50 focus:outline-none"
            />
            <NextButton onClick={() => setStep(1)}>Continue</NextButton>
          </Step>
        )}

        {step === 1 && (
          <Step title="Pick your default agent" subtitle="You can change this anytime.">
            <div className="grid gap-2 sm:grid-cols-2">
              {AGENTS.map((a) => {
                const Icon = a.icon;
                const active = agent === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setAgent(a.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      active
                        ? "border-koda-accent/60 bg-koda-accent/10"
                        : "border-koda-border bg-koda-bg hover:bg-koda-surface-2"
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-koda-accent" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-koda-text">
                        {a.label}
                        {a.pro && (
                          <span className="rounded bg-koda-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-koda-accent-soft">
                            Pro
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-koda-muted">{a.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <NextButton onClick={() => setStep(2)}>Continue</NextButton>
          </Step>
        )}

        {step === 2 && (
          <Step title="Choose a plan" subtitle="Upgrade is instant — no card required (demo billing).">
            <div className="grid gap-2 sm:grid-cols-3">
              {PLANS.map((p) => {
                const current = user?.plan === p.id;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "flex flex-col rounded-xl border p-3",
                      p.highlight
                        ? "border-koda-accent/50 bg-koda-accent/[0.07]"
                        : "border-koda-border bg-koda-bg"
                    )}
                  >
                    <p className="text-sm font-semibold text-koda-text">{p.name}</p>
                    <p className="mt-0.5 text-lg font-bold text-koda-text">
                      {p.price}
                      <span className="text-xs font-normal text-koda-muted">
                        {p.period}
                      </span>
                    </p>
                    <button
                      disabled={busy || current || p.id === "free"}
                      onClick={() => choosePlan(p.id)}
                      className={cn(
                        "mt-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                        current
                          ? "bg-koda-surface-2 text-koda-muted"
                          : p.id === "free"
                            ? "bg-koda-surface-2 text-koda-muted"
                            : "bg-koda-accent text-black hover:bg-koda-accent-soft"
                      )}
                    >
                      {current ? "Selected" : p.id === "free" ? "Default" : `Get ${p.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={finish}
              disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-koda-accent px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-koda-accent-soft disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Start using Koda AI
            </button>
          </Step>
        )}
      </motion.div>
    </div>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
    >
      <h2 className="text-xl font-semibold text-koda-text">{title}</h2>
      <p className="mb-5 mt-1 text-sm text-koda-muted">{subtitle}</p>
      {children}
    </motion.div>
  );
}

function NextButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-koda-accent px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-koda-accent-soft"
    >
      {children}
      <ChevronRight className="h-4 w-4" />
    </button>
  );
}
