import { NextResponse } from "next/server";
import { registerUser, AuthError } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { verifyLink } from "@/lib/verifyLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();
    const { user, verifyToken } = await registerUser(name, email, password);

    // Send the verification email; surface a clear error if the mailer fails so
    // the user isn't stranded with an account they can't activate.
    try {
      await sendVerificationEmail(user.email, user.name, verifyLink(req, verifyToken));
    } catch {
      return NextResponse.json(
        { error: "Account created, but we couldn't send the verification email. Try resending." },
        { status: 502 }
      );
    }

    // No session cookie — the user must verify before signing in.
    return NextResponse.json({ needsVerification: true, email: user.email });
  } catch (e) {
    const msg = e instanceof AuthError ? e.message : "Could not create account.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
