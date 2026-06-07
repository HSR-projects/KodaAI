import { NextResponse } from "next/server";
import { PLAN_PRICES } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const prices: Record<string, { usd: number; isDiscounted: boolean }> = {};
  for (const [plan, cents] of Object.entries(PLAN_PRICES)) {
    prices[plan] = { usd: cents / 100, isDiscounted: false };
  }
  return NextResponse.json({ country: null, factor: 1.0, prices });
}
