import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteThread } from "@/lib/threadsStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await deleteThread(user.id, params.id);
  return NextResponse.json({ ok: true });
}
