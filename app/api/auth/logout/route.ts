import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/authCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
