import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { creditPack } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start a one-time Stripe Checkout to buy API credits.
 *
 * This is deliberately `mode: "payment"` (not "subscription") — API credits are
 * pay-as-you-go and entirely separate from the Pro/Max plan. The webhook /
 * verify routes branch on `metadata.kind === "credits"` to fulfill them.
 */
export async function POST(req: Request) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { packId } = (await req.json()) as { packId?: string };
  const pack = packId ? creditPack(packId) : undefined;
  if (!pack) {
    return NextResponse.json({ error: "Invalid credit pack." }, { status: 400 });
  }

  const origin = req.headers.get("origin") || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: current.email,
    locale: "auto",
    billing_address_collection: "auto",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `KodaAI API Credits — ${pack.label}`,
            description: `${pack.credits} credits ($${pack.usd.toFixed(2)}) for the KodaAI API. Credits never expire.`,
          },
          unit_amount: Math.round(pack.usd * 100),
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: current.id,
      kind: "credits",
      packId: pack.id,
      credits: String(pack.credits),
    },
    success_url: `${origin}/stripe/success?session_id={CHECKOUT_SESSION_ID}&kind=credits`,
    cancel_url: `${origin}/developers?cancelled=1`,
  });

  return NextResponse.json({ url: session.url });
}
