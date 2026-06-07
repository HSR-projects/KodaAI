import { NextResponse } from "next/server";
import { verifyEmailToken, AuthError } from "@/lib/auth";
import { setSessionCookie } from "@/lib/authCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Confirm an email-verification token and sign the user in. */
export async function POST(req: Request) {
  try {
    const { token } = (await req.json()) as { token?: string };
    const { user, token: session } = await verifyEmailToken(token ?? "");
    return setSessionCookie(NextResponse.json({ user }), session);
  } catch (e) {
    const msg = e instanceof AuthError ? e.message : "Could not verify email.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
