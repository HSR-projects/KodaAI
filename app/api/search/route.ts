import { NextResponse } from "next/server";
import { searchWeb, SearchUnavailableError } from "@/lib/searxng";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let query = "";
  try {
    ({ query } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!query?.trim()) {
    return NextResponse.json({ error: "Missing query." }, { status: 400 });
  }

  try {
    const results = await searchWeb(query, 5);
    return NextResponse.json({ results });
  } catch (e) {
    const unavailable = e instanceof SearchUnavailableError;
    return NextResponse.json(
      {
        results: [],
        error: unavailable
          ? "Search backend unavailable. Falling back to No Search mode."
          : "Search failed.",
        unavailable,
      },
      { status: unavailable ? 503 : 500 }
    );
  }
}
