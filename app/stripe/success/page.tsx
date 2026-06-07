"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export default function StripeSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-koda-bg">
          <Loader2 className="h-6 w-6 animate-spin text-koda-accent" />
        </div>
      }
    >
      <StripeSuccessInner />
    </Suspense>
  );
}

function StripeSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { refresh } = useAuth();

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [plan, setPlan] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const done = useRef(false);
  const isCredits = searchParams.get("kind") === "credits";

  useEffect(() => {
    if (!sessionId || done.current) return;
    done.current = true;

    fetch("/api/stripe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Verification failed.");
        if (data.kind === "credits") setCredits(data.credits ?? null);
        else setPlan(data.user?.plan ?? null);
        // Refresh auth context so the plan/credits update in React state immediately.
        await refresh();
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [sessionId, refresh]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-koda-bg px-4 text-center">
      {status === "verifying" && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-koda-accent" />
          <p className="text-koda-text">
            {isCredits ? "Adding your credits…" : "Activating your plan…"}
          </p>
        </div>
      )}

      {status === "success" && isCredits && (
        <div className="flex flex-col items-center gap-4">
          <CheckCircle className="h-12 w-12 text-green-400" />
          <h1 className="text-2xl font-bold text-koda-text">Credits added!</h1>
          <p className="max-w-sm text-koda-muted">
            {credits !== null
              ? `Your API credit balance is now $${(credits / 100).toFixed(2)}.`
              : "Your API credits are now available."}{" "}
            Credits never expire.
          </p>
          <button
            onClick={() => router.push("/developers")}
            className="mt-2 rounded-xl bg-koda-accent px-6 py-2.5 text-sm font-semibold text-black hover:bg-koda-accent-soft"
          >
            Back to Developers
          </button>
        </div>
      )}

      {status === "success" && !isCredits && (
        <div className="flex flex-col items-center gap-4">
          <CheckCircle className="h-12 w-12 text-green-400" />
          <h1 className="text-2xl font-bold text-koda-text">
            You&apos;re on {plan ? plan.toUpperCase() : "your new plan"}!
          </h1>
          <p className="max-w-sm text-koda-muted">
            Your upgrade is active. Enjoy all the new features — welcome to the next level.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-2 rounded-xl bg-koda-accent px-6 py-2.5 text-sm font-semibold text-black hover:bg-koda-accent-soft"
          >
            Start exploring
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-4">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <h1 className="text-xl font-bold text-koda-text">Something went wrong</h1>
          <p className="max-w-sm text-koda-muted">
            Your payment may have gone through but we couldn&apos;t confirm it automatically.
            Please refresh your account or contact support.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-2 rounded-xl border border-koda-border px-5 py-2 text-sm text-koda-muted hover:bg-koda-surface-2"
          >
            Go home
          </button>
        </div>
      )}
    </div>
  );
}
