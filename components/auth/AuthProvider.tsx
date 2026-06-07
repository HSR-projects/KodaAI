"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Plan, User } from "@/types";
import { CAPS, type PlanCaps } from "@/lib/plans";
import { useKodaStore } from "@/lib/store";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  caps: PlanCaps;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (name: string, email: string, password: string) => Promise<AuthResult>;
  loginWithGoogle: () => Promise<AuthResult>;
  logout: () => Promise<void>;
  updateAccount: (patch: {
    name?: string;
    onboarded?: boolean;
    defaultAgent?: string;
    avatarColor?: string;
  }) => Promise<void>;
  /** Opens Stripe Checkout for the given paid plan. Navigates away. */
  upgrade: (plan: Plan) => Promise<void>;
  /** Cancel the subscription + refund the latest payment, returning to Free. */
  downgrade: () => Promise<{ refunded: boolean; canceled: boolean }>;
  deleteAccount: () => Promise<void>;
}

/** Outcome of a login/register attempt — signals when email verification is pending. */
export interface AuthResult {
  needsVerification?: boolean;
  email?: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function postJSON(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed.");
  return data;
}

async function loadServerThreads() {
  try {
    const res = await fetch("/api/threads", { cache: "no-store" });
    if (!res.ok) {
      // Not authorized / error — never leave another user's threads visible.
      useKodaStore.getState().setThreads([]);
      return;
    }
    const { threads } = await res.json();
    // Authoritatively REPLACE — even with an empty list — so a fresh account
    // can never inherit the previous user's chats from in-memory state.
    useKodaStore.getState().setThreads(Array.isArray(threads) ? threads : []);
  } catch {
    useKodaStore.getState().setThreads([]);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      const u = data?.user ?? null;
      setUser(u);
      if (u) await loadServerThreads();
      else useKodaStore.getState().setThreads([]);
    } catch {
      setUser(null);
      useKodaStore.getState().setThreads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data?.needsVerification) {
        return { needsVerification: true, email: data.email ?? email };
      }
      if (!res.ok) throw new Error(data?.error || "Could not sign in.");
      setUser(data.user);
      await loadServerThreads();
      return {};
    },
    []
  );

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<AuthResult> => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not create account.");
      // New accounts require email verification before a session is issued.
      if (data?.needsVerification) {
        return { needsVerification: true, email: data.email ?? email };
      }
      setUser(data.user);
      useKodaStore.getState().setThreads([]);
      return {};
    },
    []
  );

  const loginWithGoogle = useCallback(async (): Promise<AuthResult> => {
    window.location.href = "/api/auth/google/init";
    return {};
  }, []);

  const logout = useCallback(async () => {
    await postJSON("/api/auth/logout");
    setUser(null);
    useKodaStore.getState().setThreads([]);
  }, []);

  const updateAccount = useCallback(
    async (patch: { name?: string; onboarded?: boolean; defaultAgent?: string; avatarColor?: string }) => {
      const { user: u } = await postJSON("/api/account", patch);
      setUser(u);
    },
    []
  );

  const upgrade = useCallback(async (plan: Plan) => {
    if (plan === "free") return;
    const { url } = await postJSON("/api/stripe/checkout", { plan });
    if (url) window.location.href = url;
  }, []);

  const downgrade = useCallback(async () => {
    const data = await postJSON("/api/stripe/downgrade");
    setUser(data.user);
    return { refunded: !!data.refunded, canceled: !!data.canceled };
  }, []);

  const deleteAccount = useCallback(async () => {
    const res = await fetch("/api/account", { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "Could not delete account.");
    }
    setUser(null);
    useKodaStore.getState().setThreads([]);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      caps: CAPS[user?.plan ?? "free"],
      refresh,
      login,
      register,
      loginWithGoogle,
      logout,
      updateAccount,
      upgrade,
      downgrade,
      deleteAccount,
    }),
    [user, loading, refresh, login, register, loginWithGoogle, logout, updateAccount, upgrade, downgrade, deleteAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
