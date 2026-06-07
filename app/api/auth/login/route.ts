import { NextResponse } from "next/server";
import { loginUser, AuthError, EmailNotVerifiedError } from "@/lib/auth";
import { setSessionCookie } from "@/lib/authCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const { user, token } = await loginUser(email, password);
    return setSessionCookie(NextResponse.json({ user }), token);
  } catch (e) {
    if (e instanceof EmailNotVerifiedError) {
      return NextResponse.json(
        { error: e.message, needsVerification: true, email: e.email },
        { status: 403 }
      );
    }
    const msg = e instanceof AuthError ? e.message : "Could not sign in.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
