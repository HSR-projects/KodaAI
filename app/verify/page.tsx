"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-koda-bg">
          <Loader2 className="h-6 w-6 animate-spin text-koda-accent" />
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { refresh } = useAuth();

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    if (!token) {
      setStatus("error");
      setMessage("This link is missing its verification token.");
      return;
    }

    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Verification failed.");
        // Session cookie is now set — refresh auth state and head in.
        await refresh();
        setStatus("success");
        setTimeout(() => router.push("/"), 1400);
      })
      .catch((e) => {
        setStatus("error");
        setMessage((e as Error).message);
      });
  }, [token, refresh, router]);

  return (
    <div className="koda-hero-glow flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      {status === "verifying" && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-koda-accent" />
          <p className="text-koda-text">Verifying your email…</p>
        </div>
      )}

      {status === "success" && (
        <div className="flex flex-col items-center gap-4">
          <CheckCircle className="h-12 w-12 text-green-400" />
          <h1 className="text-2xl font-bold text-koda-text">Email verified!</h1>
          <p className="max-w-sm text-koda-muted">
            Your account is active. Taking you in…
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-4">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <h1 className="text-xl font-bold text-koda-text">Verification failed</h1>
          <p className="max-w-sm text-koda-muted">
            {message ?? "This link is invalid or has expired."}
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-2 rounded-xl bg-koda-accent px-6 py-2.5 text-sm font-semibold text-black hover:bg-koda-accent-soft"
          >
            Go to sign in
          </button>
        </div>
      )}
    </div>
  );
}
