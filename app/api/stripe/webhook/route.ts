import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { updateUser, updateUserStripe, downgradeBySubscriptionId, fulfillCreditSession } from "@/lib/auth";
import type { Plan } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Next.js App Router: disable body parsing so we can read raw bytes for Stripe signature verification.
export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;

  if (webhookSecret && sig) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }
  } else {
    // Dev fallback: no webhook secret configured, parse directly (only safe locally).
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch {
      return NextResponse.json({ error: "Bad payload." }, { status: 400 });
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;

    // ── API credits (one-time payment) — independent of subscription ──
    if (session.metadata?.kind === "credits") {
      const credits = parseInt(session.metadata.credits ?? "0", 10);
      if (userId && credits > 0 && session.payment_status === "paid") {
        await fulfillCreditSession(userId, session.id, credits);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Subscription upgrade ──
    const plan = session.metadata?.plan as Plan | undefined;

    if (userId && plan && (plan === "pro" || plan === "max")) {
      await updateUser(userId, { plan });

      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (customerId || subscriptionId) {
        await updateUserStripe(userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        });
      }
    }
  }

  if (
    event.type === "customer.subscription.deleted" ||
    (event.type === "customer.subscription.updated" &&
      (event.data.object as Stripe.Subscription).status === "canceled")
  ) {
    const sub = event.data.object as Stripe.Subscription;
    await downgradeBySubscriptionId(sub.id);
  }

  return NextResponse.json({ ok: true });
}
