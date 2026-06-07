"use client";

import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { AuthScreen } from "./AuthScreen";
import { Onboarding } from "./Onboarding";

/** Routes reachable without a session (email verification, payment return). */
const PUBLIC_PATHS = ["/verify", "/stripe/success"];

/**
 * Gatekeeper: shows a loader, then the auth screen, then the OOBE wizard, and
 * finally the app once the user is signed in and onboarded.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  // Public routes render regardless of auth state (e.g. clicking the email
  // verification link before any session exists).
  if (pathname && PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-koda-bg">
        <Loader2 className="h-6 w-6 animate-spin text-koda-accent" />
      </div>
    );
  }

  if (!user) return <AuthScreen />;
  if (!user.onboarded) return <Onboarding />;

  return <>{children}</>;
}
