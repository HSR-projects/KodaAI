import * as cheerio from "cheerio";
import { YoutubeTranscript } from "youtube-transcript";
import type { Source } from "@/types";

const MAX_CHARS = 2000;
const FETCH_TIMEOUT = 5000;
const IMAGE_FETCH_TIMEOUT = 3000;

// ─── YouTube helpers ───────────────────────────────────────────

export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)/.test(url);
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function scrapeYouTube(url: string): Promise<{ source: Source; images: string[] } | null> {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  // Fetch title from oEmbed (lightweight, no session required)
  let title = `YouTube Video (${videoId})`;
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (oembedRes.ok) {
      const oembed = await oembedRes.json() as { title?: string };
      if (oembed.title) title = oembed.title;
    }
  } catch { /* keep default title */ }

  // Fetch transcript via the youtube-transcript package (handles auth/signing internally)
  let transcript = "";
  try {
    const entries = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
    transcript = entries
      .map((e) => e.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
  } catch { /* no captions available */ }

  const content = transcript
    ? `[YouTube Video Transcript]\nTitle: ${title}\n\n${transcript}`
    : `YouTube Video: ${title}\n\nNo captions/transcript available for this video.`;

  // Fetch the video thumbnail as a page image for vision models
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const thumbB64 = await fetchImageBase64(thumbUrl);

  return {
    source: { url, title, content },
    images: thumbB64 ? [thumbB64] : [],
  };
}

// ─── Image fetching ────────────────────────────────────────────

/** Fetch an image and return it as a data URI (includes MIME type for Ollama Cloud compat). */
async function fetchImageBase64(imgUrl: string): Promise<string | null> {
  if (!imgUrl || imgUrl.startsWith("data:")) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT);
  try {
    const res = await fetch(imgUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KodaAI/1.0)" },
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.startsWith("image/")) return null;
    // Only forward formats vision models reliably support
    const mime = ctype.split(";")[0].trim(); // strip "; charset=..." suffixes
    if (mime === "image/svg+xml" || mime === "image/gif") return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 4 * 1024 * 1024) return null; // Skip images >4 MB
    // Return raw base64 — Ollama Cloud decodes the string directly and detects
    // format from magic bytes. Data URIs cause a base64 decode error.
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Filter out obvious non-content images (icons, spacers, tracking pixels). */
function isContentImage(src: string, pageUrl: string): boolean {
  if (!src) return false;
  // Resolve relative URLs
  try {
    new URL(src);
  } catch {
    try {
      src = new URL(src, pageUrl).href;
    } catch {
      return false;
    }
  }
  const lower = src.toLowerCase();
  // Skip data URIs (already have the data but usually icons)
  if (lower.startsWith("data:image/gif")) return false;
  // Skip known icon/tracking patterns
  if (/\/(icon|logo|avatar|badge|pixel|spacer|1x1|blank|spinner|loading|favicon)\b/i.test(lower))
    return false;
  if (/\.(gif|ico|svg)(\?|$)/i.test(lower)) return false;
  return true;
}

// ─── Regular page scraping ─────────────────────────────────────

async function scrapeOne(
  url: string
): Promise<{ source: Source; imageUrls: string[] } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KodaAI/1.0; +https://github.com/kodaai)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/html")) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("script, style, noscript, nav, footer, header, aside, form, iframe, svg, button").remove();

    const title =
      $("title").first().text().trim() ||
      $('meta[property="og:title"]').attr("content") ||
      url;

    const root = $("article").length
      ? $("article")
      : $("main").length
      ? $("main")
      : $("body");

    const text = root
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_CHARS);

    if (!text) return null;

    // Extract up to 3 content-worthy image URLs for vision analysis
    const imageUrls: string[] = [];
    $("img").each((_i, el) => {
      if (imageUrls.length >= 3) return false;
      const src =
        $(el).attr("src") ||
        $(el).attr("data-src") ||
        $(el).attr("data-lazy-src") ||
        "";
      let resolved = src;
      try {
        resolved = new URL(src, url).href;
      } catch {
        /* keep original */
      }
      if (isContentImage(resolved, url)) imageUrls.push(resolved);
    });

    return {
      source: { url, title: title.slice(0, 200), content: text },
      imageUrls,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public API ────────────────────────────────────────────────

export interface ScrapeResult {
  sources: Source[];
  /** Base64 images extracted from scraped pages (for vision models). */
  pageImages: string[];
}

/** Scrape multiple URLs. YouTube URLs get transcript extraction + thumbnail. */
export async function scrapeUrlsWithMedia(urls: string[]): Promise<ScrapeResult> {
  const results = await Promise.all(
    urls.map(async (url) => {
      if (isYouTubeUrl(url)) {
        const yt = await scrapeYouTube(url);
        if (yt) return { source: yt.source, images: yt.images };
        return null;
      }
      const r = await scrapeOne(url);
      if (!r) return null;
      // Fetch up to 2 page images in parallel; silently drop failures
      const b64s = (
        await Promise.all(r.imageUrls.slice(0, 2).map(fetchImageBase64))
      ).filter((b): b is string => b !== null);
      return { source: r.source, images: b64s };
    })
  );

  const sources: Source[] = [];
  const pageImages: string[] = [];

  for (const r of results) {
    if (!r) continue;
    sources.push(r.source);
    pageImages.push(...r.images);
  }

  return { sources, pageImages };
}

/** Legacy compat — text-only scrape (no images). */
export async function scrapeUrls(urls: string[]): Promise<Source[]> {
  const { sources } = await scrapeUrlsWithMedia(urls);
  return sources;
}
