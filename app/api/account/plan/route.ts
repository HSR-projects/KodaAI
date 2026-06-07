import { NextResponse } from "next/server";
import { getCurrentUser, updateUser, AuthError } from "@/lib/auth";
import type { Plan } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: Plan[] = ["free", "pro", "max"];

/**
 * DUMMY billing. Applies the requested plan to the signed-in user instantly,
 * with no charge. When real payments land, gate this behind a verified
 * checkout/webhook before calling updateUser.
 */
export async function POST(req: Request) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  try {
    const { plan } = (await req.json()) as { plan?: Plan };
    if (!plan || !VALID.includes(plan)) {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }
    const user = await updateUser(current.id, { plan });
    return NextResponse.json({ user, simulated: true });
  } catch (e) {
    const msg = e instanceof AuthError ? e.message : "Could not change plan.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
