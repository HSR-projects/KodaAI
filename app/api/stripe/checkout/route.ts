import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { stripe, PLAN_PRICES, PLAN_NAMES, PLAN_DESCRIPTIONS } from "@/lib/stripe";
import type { Plan } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAID_PLANS: Plan[] = ["pro", "max"];

export async function POST(req: Request) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { plan } = (await req.json()) as { plan?: Plan };
  if (!plan || !PAID_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const origin = req.headers.get("origin") || "http://localhost:3000";
  const amount = PLAN_PRICES[plan];

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: current.email,
    locale: "auto",
    billing_address_collection: "auto",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: PLAN_NAMES[plan],
            description: PLAN_DESCRIPTIONS[plan],
          },
          unit_amount: amount,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: current.id,
      plan,
    },
    success_url: `${origin}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?cancelled=1`,
  });

  return NextResponse.json({ url: session.url });
}
