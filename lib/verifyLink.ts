/**
 * Build the absolute email-verification URL. Prefers APP_URL, falling back to
 * the request's origin/host so links work in dev and behind proxies.
 */
export function verifyLink(req: Request, token: string): string {
  const base = appBaseUrl(req);
  return `${base}/verify?token=${encodeURIComponent(token)}`;
}

export function appBaseUrl(req: Request): string {
  const env = process.env.APP_URL?.replace(/\/$/, "");
  if (env) return env;
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
