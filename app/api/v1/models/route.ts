import { getUserByApiKey } from "@/lib/auth";
import { listModels, DEFAULT_MODEL, FORCE_MODEL, isBlockedModel } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** OpenAI-compatible model list — what Open WebUI fetches to populate its picker. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!secret || !(await getUserByApiKey(secret))) {
    return json({ error: { message: "Invalid or missing API key.", type: "invalid_request_error" } }, 401);
  }

  let names: string[];
  if (FORCE_MODEL) {
    names = [FORCE_MODEL];
  } else {
    try {
      names = (await listModels()).map((m) => m.name).filter((n) => n && !isBlockedModel(n));
    } catch {
      names = [];
    }
    if (DEFAULT_MODEL && !names.includes(DEFAULT_MODEL)) names.unshift(DEFAULT_MODEL);
  }

  const created = Math.floor(Date.now() / 1000);
  return json({
    object: "list",
    data: names.map((id) => ({ id, object: "model", created, owned_by: "kodaai" })),
  });
}
