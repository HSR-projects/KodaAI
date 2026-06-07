import { NextRequest, NextResponse } from "next/server";
import { upsertGoogleUser } from "@/lib/auth";
import { setSessionCookie } from "@/lib/authCookie";
import { verifyGoogleToken } from "@/lib/googleAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? "http://localhost:3002";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("google_oauth_state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${APP_URL}/?auth_error=1`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${APP_URL}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as { id_token?: string };
    if (!tokenData.id_token) {
      return NextResponse.redirect(`${APP_URL}/?auth_error=1`);
    }

    const profile = await verifyGoogleToken(tokenData.id_token);
    if (!profile.email) {
      return NextResponse.redirect(`${APP_URL}/?auth_error=1`);
    }

    const { user, token } = await upsertGoogleUser({
      googleId: profile.uid,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });

    const res = NextResponse.redirect(APP_URL);
    res.cookies.delete("google_oauth_state");
    return setSessionCookie(res, token);
  } catch {
    return NextResponse.redirect(`${APP_URL}/?auth_error=1`);
  }
}
