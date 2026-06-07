# 🔮 KodaAI

A privacy-first, Perplexity-style AI search & chat app — powered by **Ollama Cloud**.
No OpenAI, no Anthropic, no telemetry. Search-augmented, cited answers with a
polished dark UI.

> **This build uses Ollama _Cloud_ (`https://ollama.com`), not a local Ollama daemon.**
> You bring your own Ollama Cloud API key; inference runs on your Ollama account.

![stack](https://img.shields.io/badge/Next.js-14-black) ![stack](https://img.shields.io/badge/TypeScript-5-blue) ![stack](https://img.shields.io/badge/Ollama-Cloud-9b7cff)

---

## Features

- **Search-augmented chat (agentic RAG)** — SearXNG web search → scrape → grounded, cited answer
- **Token-by-token streaming** with an animated cursor
- **Inline citations** `[1]` `[2]` linked to source cards
- **Auto follow-up questions** after every answer
- **Thread history** persisted in `localStorage`
- **Model switcher** — lists your Ollama Cloud models
- **Focus modes** — All · No Search · Code · Academic
- **Privacy dashboard** — shows the active model and a 0 third-party-AI-calls counter
- **Mobile responsive**, keyboard-navigable, accessible

---

## Quick start

### 1. Get an Ollama Cloud API key

Sign in at **https://ollama.com**, then create a key under **Settings → Keys**.
Cloud models include `gpt-oss:120b`, `gpt-oss:20b`, `qwen3-coder:480b`,
`deepseek-v3.1:671b`, and more.

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_API_KEY=sk-...your-key...
OLLAMA_DEFAULT_MODEL=gpt-oss:120b
SEARXNG_BASE_URL=http://localhost:8080
```

### 3. Install & run

```bash
npm install
npm run dev
```

Open **http://localhost:3000**.

> Using `pnpm`? `pnpm install && pnpm dev` works identically.

---

## Web search (for "All" / "Academic" modes)

Web search runs through the **Ollama Cloud Web Search API**, authenticated with
the same `OLLAMA_API_KEY` — **no separate search key or server required.** Results
already include page content, so no scraping step is needed. If search fails for
any reason, KodaAI degrades to "No Search" mode with a banner.

Backend priority: **Ollama Cloud Web Search → SearXNG → Brave**.

**SearXNG fallback (only needed if you run a _local_ Ollama daemon, which has no
web search):**

```bash
docker run -d --name searxng -p 8080:8080 \
  -v searxng-data:/etc/searxng searxng/searxng:latest
```

> SearXNG must return JSON — enable `formats: [html, json]` in its `settings.yml`.

**Brave fallback (optional):** set `BRAVE_SEARCH_API_KEY` in `.env`.

---

## Want to run fully local instead of cloud?

The Ollama client is endpoint-agnostic. Point it at a local daemon:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_API_KEY=
OLLAMA_DEFAULT_MODEL=llama3.2
```

```bash
ollama serve
ollama pull llama3.2
```

---

## Architecture

```
User query
  └─ /api/search  → Ollama Cloud Web Search (top 5 + page content)
       └─ /api/scrape → cheerio fallback, only for results lacking content
            └─ /api/chat → Ollama Cloud (streamed SSE)
                 └─ follow-up questions (second, non-streaming call)
```

| Path | Purpose |
|---|---|
| `app/api/chat` | Streaming chat (SSE) + follow-up generation |
| `app/api/search` | Ollama Cloud web search (SearXNG / Brave fallback) |
| `app/api/scrape` | URL → readable text (fallback only) |
| `app/api/ollama/models` | Lists Ollama Cloud models |
| `lib/ollama.ts` | Cloud client (bearer auth, streaming) |
| `lib/store.ts` | Zustand state (threads, model, focus mode) |
| `hooks/useChat.ts` | Orchestrates search → scrape → stream |

---

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS v3 · Radix UI primitives ·
Framer Motion · Zustand · react-markdown + remark-gfm + rehype-highlight ·
Lucide icons · Ollama Cloud.

---

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm run start   # serve production build
npm run lint    # eslint
```

---

## Privacy notes

- Inference runs on **your** Ollama Cloud account — not on OpenAI/Anthropic.
- Web search (when enabled) goes to **your** SearXNG instance.
- Threads live in your browser's `localStorage`; nothing is uploaded by KodaAI.
- The privacy badge tracks third-party AI calls (always `0` by design).

---

Built as a privacy-respecting alternative to hosted AI search. 🔒
