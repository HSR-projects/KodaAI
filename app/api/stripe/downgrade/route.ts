import { NextResponse } from "next/server";
import { getCurrentUser, getUserStripeIds, setUserFree } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PiRef = string | { id?: string } | undefined | null;
function piId(ref: PiRef): string | undefined {
  return typeof ref === "string" ? ref : ref?.id ?? undefined;
}

/**
 * Downgrade the current user to the Free plan: cancel their Stripe subscription
 * and refund the most recent subscription payment. Subscription billing only —
 * prepaid API credits are separate and are left untouched.
 */
export async function POST() {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Already free — nothing to cancel or refund.
  if (current.plan === "free") {
    return NextResponse.json({ user: current, refunded: false, canceled: false });
  }

  const { subscriptionId } = await getUserStripeIds(current.id);

  let refunded = false;
  let canceled = false;

  if (subscriptionId) {
    // Refund the latest invoice's payment. Field layout differs across Stripe
    // API versions, so resolve the PaymentIntent id defensively.
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const invoiceId =
        typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;

      if (invoiceId) {
        const inv = (await stripe.invoices.retrieve(invoiceId)) as unknown as {
          payment_intent?: PiRef;
          payments?: { data?: Array<{ payment?: { payment_intent?: PiRef } }> };
        };
        const paymentIntentId =
          piId(inv.payment_intent) ?? piId(inv.payments?.data?.[0]?.payment?.payment_intent);
        if (paymentIntentId) {
          await stripe.refunds.create({ payment_intent: paymentIntentId });
          refunded = true;
        }
      }
    } catch {
      // Refund may fail (already refunded, disputed, etc.) — continue to cancel.
    }

    // Cancel the subscription immediately.
    try {
      await stripe.subscriptions.cancel(subscriptionId);
    } catch {
      // Treat an already-canceled subscription as success.
    }
    canceled = true;
  }

  const user = await setUserFree(current.id);
  return NextResponse.json({ user, refunded, canceled });
}
