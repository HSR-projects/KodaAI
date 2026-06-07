import { NextResponse } from "next/server";
import {
  getCurrentUser,
  updateUser,
  updateUserStripe,
  fulfillCreditSession,
  getCredits,
} from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import type { Plan } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Called by the success page to verify and apply a plan upgrade or credit top-up. */
export async function POST(req: Request) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { sessionId } = (await req.json()) as { sessionId?: string };
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session ID." }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    return NextResponse.json({ error: "Payment not completed." }, { status: 402 });
  }

  const userId = session.metadata?.userId;
  if (!userId || userId !== current.id) {
    return NextResponse.json({ error: "Session mismatch." }, { status: 403 });
  }

  // ── Credit top-up (one-time payment) — separate from subscriptions ──
  if (session.metadata?.kind === "credits") {
    const credits = parseInt(session.metadata.credits ?? "0", 10);
    if (credits > 0) await fulfillCreditSession(userId, session.id, credits);
    const balance = await getCredits(userId);
    return NextResponse.json({ kind: "credits", credits: balance });
  }

  // ── Subscription upgrade ──
  const plan = session.metadata?.plan as Plan | undefined;
  if (!plan || (plan !== "pro" && plan !== "max")) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const user = await updateUser(userId, { plan });

  const customerId =
    typeof session.customer === "string" ? session.customer : undefined;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : undefined;

  if (customerId || subscriptionId) {
    await updateUserStripe(userId, { stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId });
  }

  return NextResponse.json({ user });
}
