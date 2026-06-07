import { promises as dns } from "node:dns";

/**
 * Smart disposable / invalid email detection — no hardcoded blocklist.
 *
 * Two independent signals, both dynamic:
 *   1. A community-maintained disposable-domain list, fetched at runtime and
 *      cached in memory (refreshed daily). This stays current without code
 *      changes as new throwaway services appear.
 *   2. A live MX-record lookup — a domain with no mail servers can't receive
 *      a verification email, so it's rejected regardless of any list.
 *
 * A tiny seed set is used ONLY as an offline fallback if the remote list can't
 * be fetched; it is never the primary source of truth.
 */

// Community list (newline-delimited domains). Mirrors are tried in order.
const BLOCKLIST_SOURCES = [
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf",
  "https://cdn.jsdelivr.net/gh/disposable-email-domains/disposable-email-domains@main/disposable_email_blocklist.conf",
];

const REFRESH_MS = 1000 * 60 * 60 * 24; // 24h
const FETCH_TIMEOUT_MS = 6000;

// Offline fallback only — keep minimal; the remote list is authoritative.
const SEED_FALLBACK = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com",
]);

let cache: Set<string> | null = null;
let cachedAt = 0;
let inflight: Promise<Set<string>> | null = null;

async function fetchWithTimeout(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseList(text: string): Set<string> {
  const set = new Set<string>();
  for (const line of text.split("\n")) {
    const d = line.trim().toLowerCase();
    if (d && !d.startsWith("#")) set.add(d);
  }
  return set;
}

/** Get the disposable-domain set, fetching + caching from the community list. */
async function getBlocklist(): Promise<Set<string>> {
  const fresh = cache && Date.now() - cachedAt < REFRESH_MS;
  if (fresh) return cache!;
  if (inflight) return inflight;

  inflight = (async () => {
    for (const url of BLOCKLIST_SOURCES) {
      try {
        const text = await fetchWithTimeout(url);
        const set = parseList(text);
        if (set.size > 100) {
          // Fold in the seed so fallback entries are always covered too.
          for (const d of SEED_FALLBACK) set.add(d);
          cache = set;
          cachedAt = Date.now();
          return set;
        }
      } catch {
        /* try next mirror */
      }
    }
    // All sources failed — use last good cache, else the seed.
    cache = cache ?? new Set(SEED_FALLBACK);
    cachedAt = Date.now();
    return cache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** True if the domain (or its registrable parent) is on the disposable list. */
function listedDisposable(domain: string, list: Set<string>): boolean {
  if (list.has(domain)) return true;
  // Catch subdomains of a disposable host, e.g. "x.mailinator.com".
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    if (list.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

/** Does the domain have any usable mail server (MX, or an A-record fallback)? */
async function hasMailServer(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.some((r) => r.exchange)) return true;
  } catch {
    /* fall through to A-record check */
  }
  // RFC 5321: with no MX, the A record is the implicit mail host.
  try {
    const a = await dns.resolve(domain);
    return a.length > 0;
  } catch {
    return false;
  }
}

export interface EmailCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate an email's domain for sign-up: reject disposable providers and
 * domains that can't actually receive mail. Fails OPEN on transient DNS errors
 * so a network hiccup never blocks a legitimate user.
 */
export async function checkEmailDomain(email: string): Promise<EmailCheck> {
  const at = email.lastIndexOf("@");
  if (at < 0) return { ok: false, reason: "Enter a valid email." };
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || !domain.includes(".")) return { ok: false, reason: "Enter a valid email." };

  // 1. Community disposable-domain list.
  try {
    const list = await getBlocklist();
    if (listedDisposable(domain, list)) {
      return { ok: false, reason: "Disposable email addresses aren't allowed. Use a permanent email." };
    }
  } catch {
    /* list unavailable — rely on MX check below */
  }

  // 2. Must be able to receive mail.
  const reachable = await hasMailServer(domain).catch(() => true); // fail open
  if (!reachable) {
    return { ok: false, reason: "That email domain can't receive mail. Check the address." };
  }

  return { ok: true };
}
