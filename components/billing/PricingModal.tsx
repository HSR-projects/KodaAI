"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, Zap, CreditCard, ArrowDownCircle } from "lucide-react";
import type { Plan } from "@/types";
import { PLANS } from "@/lib/plans";
import { useAuth } from "@/components/auth/AuthProvider";
import { useKodaStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Header chip that shows the current plan and opens the pricing dialog. */
export function PlanBadge() {
  const { user } = useAuth();
  const open = useKodaStore((s) => s.pricingOpen);
  const setOpen = useKodaStore((s) => s.setPricingOpen);
  const plan = user?.plan ?? "free";
  const isPaid = plan !== "free";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          aria-label="Plans & billing"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
            isPaid
              ? "border-koda-accent/50 bg-koda-accent/15 text-koda-accent-soft"
              : "border-koda-border bg-koda-surface text-koda-text hover:bg-koda-surface-2"
          )}
        >
          {isPaid ? (
            <Zap className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-koda-accent" />
          )}
          {isPaid ? plan.toUpperCase() : "Upgrade"}
        </button>
      </DialogTrigger>
      <PricingContent />
    </Dialog>
  );
}

function PricingContent() {
  const { user, upgrade, downgrade } = useAuth();
  const current = user?.plan ?? "free";
  const [busy, setBusy] = useState<Plan | null>(null);
  const [downgrading, setDowngrading] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const choose = async (plan: Plan) => {
    if (plan === current || plan === "free") return;
    setBusy(plan);
    try {
      await upgrade(plan);
    } finally {
      setBusy(null);
    }
  };

  const handleDowngrade = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Downgrade to Free? Your subscription will be canceled and your most recent payment refunded."
      )
    )
      return;
    setDowngrading(true);
    setStatus(null);
    try {
      const r = await downgrade();
      setStatus({
        kind: "success",
        text: r.refunded
          ? "Downgraded to Free — your latest payment has been refunded."
          : "Downgraded to Free and your subscription was canceled.",
      });
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message || "Could not downgrade." });
    } finally {
      setDowngrading(false);
    }
  };

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Plans & billing</DialogTitle>
        <DialogDescription>
          Upgrade to unlock all models, autonomous agents, and stronger chess.
          Payments are processed securely by Stripe.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-3 text-xs text-koda-muted">
        <span className="flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5" />
          Secure · Cancel anytime
        </span>
      </div>

      {status && (
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-xs",
            status.kind === "success"
              ? "bg-green-500/10 text-green-300"
              : "bg-red-500/10 text-red-300"
          )}
        >
          {status.text}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = current === p.id;

          return (
            <div
              key={p.id}
              className={cn(
                "flex flex-col rounded-2xl border p-4",
                p.highlight
                  ? "border-koda-accent/50 bg-koda-accent/[0.06]"
                  : "border-koda-border bg-koda-surface-2"
              )}
            >
              {p.highlight && (
                <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-koda-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-koda-accent-soft">
                  Most popular
                </span>
              )}
              <h3 className="text-base font-semibold text-koda-text">{p.name}</h3>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-koda-text">{p.price}</span>
                <span className="text-xs text-koda-muted">{p.period}</span>
              </div>
              <p className="mt-1 text-xs text-koda-muted">{p.tagline}</p>

              <ul className="mt-3 flex-1 space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-koda-text/90">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-koda-accent" />
                    {f}
                  </li>
                ))}
              </ul>

              {p.id === "free" && current !== "free" ? (
                <button
                  disabled={downgrading}
                  onClick={handleDowngrade}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-koda-border bg-koda-surface px-3 py-2 text-sm font-semibold text-koda-text transition-colors hover:bg-koda-surface-2 disabled:opacity-60"
                >
                  {downgrading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4" />
                  )}
                  Downgrade &amp; refund
                </button>
              ) : (
                <button
                  disabled={isCurrent || busy === p.id || p.id === "free"}
                  onClick={() => choose(p.id)}
                  className={cn(
                    "mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                    isCurrent || p.id === "free"
                      ? "cursor-default bg-koda-surface text-koda-muted"
                      : p.highlight || p.id === "max"
                        ? "bg-koda-accent text-black hover:bg-koda-accent-soft"
                        : "border border-koda-border bg-koda-surface text-koda-text hover:bg-koda-surface-2"
                  )}
                >
                  {busy === p.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isCurrent ? "Current plan" : p.id === "free" ? "Free" : p.cta}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </DialogContent>
  );
}
