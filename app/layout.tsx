import type { Metadata, Viewport } from "next";
import "highlight.js/styles/github-dark.css";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AuthGate } from "@/components/auth/AuthGate";

export const metadata: Metadata = {
  title: "Koda AI — Private AI Search",
  description:
    "Privacy-first AI search and chat by Koda AI. No OpenAI, no Anthropic, no telemetry.",
  icons: { icon: "/koda-logo.svg" },
};

// `viewport-fit=cover` lets the app extend under the iOS notch/home indicator so
// our `env(safe-area-inset-*)` padding can keep content clear of them.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthProvider>
          <TooltipProvider delayDuration={150}>
            <AuthGate>{children}</AuthGate>
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
