import { NextResponse } from "next/server";
import { regenerateVerifyToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { verifyLink } from "@/lib/verifyLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend a verification email. Always responds with { ok: true } regardless of
 * whether the account exists or is already verified — avoids leaking which
 * emails are registered.
 */
export async function POST(req: Request) {
  let email = "";
  try {
    ({ email } = (await req.json()) as { email: string });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await regenerateVerifyToken(email);
  if (result) {
    try {
      await sendVerificationEmail(
        result.user.email,
        result.user.name,
        verifyLink(req, result.verifyToken)
      );
    } catch {
      /* swallow — don't reveal send failures tied to existence */
    }
  }

  return NextResponse.json({ ok: true });
}
