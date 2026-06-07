import { NextResponse } from "next/server";
import { getCurrentUser, listApiKeys, createApiKey, revokeApiKey } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the signed-in user's API keys (masked). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const keys = await listApiKeys(user.id);
  return NextResponse.json({ keys });
}

/** Create a new API key — the full secret is returned ONCE. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let name = "Default key";
  try {
    const body = (await req.json()) as { name?: string };
    if (body?.name) name = body.name;
  } catch {
    /* empty body is fine */
  }

  try {
    const { secret, key } = await createApiKey(user.id, name);
    return NextResponse.json({ secret, key });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Revoke an API key by id. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  let id = searchParams.get("id") ?? "";
  if (!id) {
    try {
      const body = (await req.json()) as { id?: string };
      id = body?.id ?? "";
    } catch {
      /* ignore */
    }
  }
  if (!id) return NextResponse.json({ error: "Missing key id." }, { status: 400 });

  await revokeApiKey(user.id, id);
  return NextResponse.json({ ok: true });
}
