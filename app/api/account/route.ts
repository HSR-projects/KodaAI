import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser, updateUser, deleteUser, AuthError, SESSION_COOKIE } from "@/lib/auth";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Patch the signed-in user's profile. */
export async function POST(req: Request) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  try {
    const body = await req.json();
    const patch: {
      name?: string;
      onboarded?: boolean;
      defaultAgent?: string;
      avatarColor?: string;
    } = {};
    if (typeof body.name === "string" && body.name.trim())
      patch.name = body.name.trim();
    if (typeof body.onboarded === "boolean") patch.onboarded = body.onboarded;
    if (typeof body.defaultAgent === "string")
      patch.defaultAgent = body.defaultAgent;
    if (typeof body.avatarColor === "string")
      patch.avatarColor = body.avatarColor;

    const user = await updateUser(current.id, patch);
    return NextResponse.json({ user });
  } catch (e) {
    const msg = e instanceof AuthError ? e.message : "Could not update account.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** Delete the signed-in user's account and clear their data. */
export async function DELETE() {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  try {
    // Remove threads file
    const threadsPath = path.join(process.cwd(), "data", "threads", `${current.id}.json`);
    await fs.rm(threadsPath, { force: true });

    // Remove user from DB
    await deleteUser(current.id);

    // Clear session cookie
    cookies().set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete account." }, { status: 500 });
  }
}
