import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readThreads, upsertThread } from "@/lib/threadsStorage";
import type { Thread } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const threads = await readThreads(user.id);
  return NextResponse.json({ threads });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let thread: Thread;
  try {
    ({ thread } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (!thread?.id) return NextResponse.json({ error: "Invalid thread." }, { status: 400 });

  // Strip still-streaming messages before persisting.
  const clean: Thread = {
    ...thread,
    messages: thread.messages.filter((m) => !m.streaming),
  };

  await upsertThread(user.id, clean);
  return NextResponse.json({ ok: true });
}
