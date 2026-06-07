"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Loader2, Lock, Mail, MailCheck, User as UserIcon } from "lucide-react";
import { useAuth } from "./AuthProvider";

export function AuthScreen() {
  const { login, register, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.search.includes("auth_error=1")) {
      setError("Google sign-in failed. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "register"
          ? await register(name, email, password)
          : await login(email, password);
      if (res?.needsVerification) {
        setPendingEmail(res.email ?? email);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGoogleBusy(false);
    }
  };

  if (pendingEmail) {
    return <VerifyNotice email={pendingEmail} onBack={() => { setPendingEmail(null); setMode("login"); }} />;
  }

  return (
    <div className="koda-hero-glow flex min-h-dvh items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm rounded-2xl border border-koda-border bg-koda-surface/70 p-6 backdrop-blur-xl"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/koda-logo.svg" alt="Koda AI" width={40} height={40} priority />
          <h1 className="mt-3 text-xl font-semibold text-koda-text">
            {mode === "register" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-koda-muted">
            Private AI search, agents & chess — powered by Koda AI.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <Field
              icon={<UserIcon className="h-4 w-4" />}
              type="text"
              placeholder="Name"
              value={name}
              onChange={setName}
              autoComplete="name"
            />
          )}
          <Field
            icon={<Mail className="h-4 w-4" />}
            type="email"
            placeholder="Email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <Field
            icon={<Lock className="h-4 w-4" />}
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || googleBusy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-koda-accent px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-koda-accent-soft disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "register" ? "Create account" : "Sign in"}
          </button>
        </form>

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-koda-border" />
          <span className="text-xs text-koda-muted">or</span>
          <div className="h-px flex-1 bg-koda-border" />
        </div>

        {/* Google sign-in */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleBusy || busy}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-koda-border bg-koda-bg px-4 py-2.5 text-sm font-medium text-koda-text transition-colors hover:bg-koda-surface-2 disabled:opacity-60"
        >
          {googleBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </button>

        <p className="mt-4 text-center text-sm text-koda-muted">
          {mode === "register" ? "Already have an account?" : "New here?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setError(null);
            }}
            className="font-medium text-koda-accent-soft hover:underline"
          >
            {mode === "register" ? "Sign in" : "Create one"}
          </button>
        </p>
      </motion.div>
    </div>
  );
}

function VerifyNotice({ email, onBack }: { email: string; onBack: () => void }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const resend = async () => {
    setSending(true);
    setSent(false);
    try {
      await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="koda-hero-glow flex min-h-dvh items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm rounded-2xl border border-koda-border bg-koda-surface/70 p-6 text-center backdrop-blur-xl"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-koda-accent/15">
          <MailCheck className="h-6 w-6 text-koda-accent" />
        </div>
        <h1 className="text-xl font-semibold text-koda-text">Check your inbox</h1>
        <p className="mt-2 text-sm text-koda-muted">
          We sent a verification link to{" "}
          <span className="font-medium text-koda-text">{email}</span>. Click it to
          activate your account, then sign in.
        </p>

        <button
          onClick={resend}
          disabled={sending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-koda-accent px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-koda-accent-soft disabled:opacity-60"
        >
          {sending && <Loader2 className="h-4 w-4 animate-spin" />}
          {sent ? "Email sent" : "Resend email"}
        </button>

        <button
          onClick={onBack}
          className="mt-3 text-sm font-medium text-koda-muted hover:text-koda-text"
        >
          Back to sign in
        </button>
      </motion.div>
    </div>
  );
}

function Field({
  icon,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-koda-border bg-koda-bg px-3 py-2.5 focus-within:border-koda-accent/50">
      <span className="text-koda-muted">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="w-full bg-transparent text-sm text-koda-text placeholder:text-koda-muted/60 focus:outline-none"
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
