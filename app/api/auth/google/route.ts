import { NextResponse } from "next/server";
import { verifyGoogleToken } from "@/lib/googleAuth";
import { upsertGoogleUser } from "@/lib/auth";
import { setSessionCookie } from "@/lib/authCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let idToken = "";
  try {
    const body = (await req.json()) as { idToken?: string };
    idToken = body.idToken ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!idToken) {
    return NextResponse.json({ error: "Missing ID token." }, { status: 400 });
  }

  try {
    const profile = await verifyGoogleToken(idToken);
    if (!profile.email) {
      return NextResponse.json(
        { error: "Your Google account has no associated email address." },
        { status: 400 }
      );
    }

    const { user, token } = await upsertGoogleUser({
      googleId: profile.uid,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });

    return setSessionCookie(NextResponse.json({ user }), token);
  } catch (e) {
    console.error("Google sign-in error:", e);
    return NextResponse.json({ error: "Google sign-in failed. Please try again." }, { status: 401 });
  }
}
