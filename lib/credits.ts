import type { ApiUsage, CreditPack } from "@/types";

/**
 * Credit + metering model for the public API.
 *
 * Credits are denominated in **US cents** (1 credit = $0.01) so they map 1:1 to
 * Stripe one-time payments. API access is pure pay-as-you-go and entirely
 * independent of the Pro/Max subscription — a Free-plan user with credits can
 * call the API; a Max subscriber with no credits cannot.
 */

/** Buyable credit packs (one-time Stripe `payment` checkouts). */
export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", label: "Starter", usd: 5, credits: 500 },
  { id: "standard", label: "Standard", usd: 10, credits: 1000, note: "Most popular" },
  { id: "pro", label: "Builder", usd: 25, credits: 2500 },
  { id: "scale", label: "Scale", usd: 50, credits: 5000, note: "Best value" },
];

export function creditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

/** Cents charged per 1,000 tokens (prompt + completion). Configurable via env. */
export const API_CENTS_PER_1K = Number(process.env.API_CENTS_PER_1K || 1);

/** Minimum charge per request, in cents — covers tiny calls. */
export const API_MIN_CENTS = Number(process.env.API_MIN_CENTS || 1);

/** Flat charge per generated image (US cents). Configurable via API_IMAGE_CENTS. */
export const IMAGE_COST_CENTS = Number(process.env.API_IMAGE_CENTS || 4);

/** Rough token estimate (~4 chars/token) — documented as an estimate. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Compute the credit cost (US cents) for a request's token usage. */
export function computeCost(promptTokens: number, completionTokens: number): number {
  const total = promptTokens + completionTokens;
  const raw = (total / 1000) * API_CENTS_PER_1K;
  return Math.max(API_MIN_CENTS, Math.ceil(raw));
}

/** Build the usage object returned to API callers. */
export function buildUsage(
  promptTokens: number,
  completionTokens: number,
  creditsCharged: number,
  creditsRemaining: number
): ApiUsage {
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    creditsCharged,
    creditsRemaining,
  };
}

/** Format a cents balance as a dollar string, e.g. 1234 → "$12.34". */
export function formatCredits(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
