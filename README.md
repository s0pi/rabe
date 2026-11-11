# RABÉ – The Argie Experience

> *"Handsome by Nature, Funny by Default."*

RABÉ is the personal app of **Mark Argie P. Rabe**. Inside it lives **Bro**, Rabe's AI best friend. Rabe is the only user, and Bro always talks to him as "Rabe". Bro is funny, a little sarcastic, always on Rabe's side, and helps with anything: school, criminology, poems, money ideas, current events (it can search the web), or just talking when Rabe needs a friend.

**Stack:** Next.js 16 (App Router, TypeScript) · Groq free tier running OpenAI GPT-OSS 120B with built-in web search · Postgres (Neon) · deployed on Vercel. Gemini and Claude are also supported.

**What Bro can do**
- **Chat about anything** in English, Tagalog, or Bisaya, with web search for current info or answers it doesn't know.
- **Remember things about Rabe.** Facts he shares (birthday, favorite food, people, school stuff) are saved to the database automatically. Corrections overwrite old info, and "forget that" deletes it. Birthday countdowns and age are calculated by the app, not guessed. Rabe can view or edit everything in **About Rabe → What Bro remembers**.
- **Read attachments:** photos (JPG/PNG/WEBP), PDF, Word (.docx) and PowerPoint (.pptx), up to 5 per message and 4 MB each. Photos are read by a vision model, which transcribes all the text and describes the image. Documents are read page by page or slide by slide, including speaker notes. Bro answers from the real content, and follow-up questions ("now answer number 3") reuse the file.
- **Live floating face:** Rabe's face floats above the message box, looks thoughtful while Bro thinks or searches, nods while Bro answers, and celebrates when Bro is done.

---

## 1. Run it locally

```bash
npm install
cp .env.example .env.local      # then paste your GROQ_API_KEY into it
npm run dev                     # http://localhost:3000
```

**Free API key (no credit card):** sign up at **https://console.groq.com/keys**, click **Create API Key**, and paste it into `.env.local`:

```
GROQ_API_KEY=gsk_...
```

RABÉ uses **GPT-OSS 120B**, the smartest free model on Groq, with Groq's built-in **browser search** for news, prices and other current info. If you hit the free rate limit, it automatically falls back to GPT-OSS 20B (also with search), then Qwen. A rate-limited model is skipped for 5 minutes. Your limits are shown at https://console.groq.com/settings/limits.

When `DATABASE_URL` is empty, chats are saved to `.data/rabe-db.json`, so no database is needed for local development.

## 2. Deploy (Vercel + Neon Postgres)

**Why this setup:** Vercel runs Next.js natively and streams AI replies, and its free tier is enough to start. Neon is serverless Postgres with a free tier, it connects to Vercel in one click, and it scales down to zero when nobody is chatting.

1. Push this folder to a GitHub repository.
2. Go to **vercel.com → Add New → Project** and import the repo. Keep the default settings.
3. In the project, open **Storage → Create Database → Neon (Postgres)** and connect it. Vercel adds `DATABASE_URL` for you.
   *(Or create a database at neon.tech yourself and paste its connection string as `DATABASE_URL`.)*
4. Under **Settings → Environment Variables**, add:
   | Name | Value |
   |---|---|
   | `GROQ_API_KEY` | your free Groq key |
   | `LLM_PROVIDER` | `groq` |
   | `APP_PASSCODE` | Rabe's passcode (**required for a public site**, otherwise anyone with the link can use it) |
5. **Deploy.** The database tables are created automatically on the first request. You can also run `npm run db:setup` with `DATABASE_URL` set.

Any Postgres provider works: Neon, Supabase, Railway, or self-hosted. Only `DATABASE_URL` changes.

## 3. Configuration

All settings live in environment variables (see `.env.example`):

| Variable | Default | What it does |
|---|---|---|
| `LLM_PROVIDER` | auto | `groq`, `gemini`, `anthropic`, or `openai-compatible`. Empty picks whichever key is set. |
| `GROQ_API_KEY` | — | Free Groq key (default provider) |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | First model tried (the smartest) |
| `GROQ_FALLBACK_MODELS` | `openai/gpt-oss-20b,qwen/qwen3.8-27b` | Used when the model before it is rate-limited |
| `ENABLE_WEB_SEARCH` | `true` | Lets RABÉ search the web (GPT-OSS on Groq, Gemini, Claude) |
| `GEMINI_API_KEY` | — | Google Gemini. Free only on eligible Google projects; some projects require billing. |
| `ANTHROPIC_API_KEY` | — | Claude (paid). Default model `claude-opus-5-5`. |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | — | Any other OpenAI-compatible API |
| `VISION_MODEL` | `qwen/qwen3.8-27b` | Model that reads photos (Groq, free). |
| `MEMORY_MODELS` | `openai/gpt-oss-20b,qwen/qwen3.8-27b` | Small, fast models that decide what to remember. |
| `HISTORY_CHARS` / `ATTACHMENT_CHARS` | 4000 / 8000 on Groq | How much chat history and file text go into each request. Groq's free tier allows about 8k tokens per request, so these are kept small; raise them on paid providers. |
| `APP_PASSCODE` | — | Locks the whole app (chat, history, photos) behind a passcode. Only Rabe gets in; his chat history is shared across all his devices. Changing it signs out every device. Empty = no lock. |
| `DATABASE_URL` | — | Postgres connection string. If empty, chats go to a local file. |
| `RATE_LIMIT_PER_5_MIN` | `30` | Messages allowed per visitor every 5 minutes |

API keys stay on the server. The browser never sees them.

## 4. Editing Argie's info and personality

| File | Controls |
|---|---|
| `src/lib/knowledge/argie.ts` | **Argie's facts**, the single source of truth. Used by both the AI and the About page. |
| `src/lib/knowledge/photos.ts` + `public/argie/` | **Argie's photos**: the image files plus a written description of each (the AI reads descriptions, not pixels). RABÉ shows 1–2 in chat when people ask about Argie; all appear in the About gallery. |
| `src/lib/ai/persona.ts` | Bro's personality, humor, language, poetry, photo, emotional-support, and honesty rules |
| `src/app/globals.css` | Theme colors and design tokens (top of the file) |

**Adding a photo:** resize it (about 900px tall is plenty), save it as `.webp` in `public/argie/`, then add an entry to `photos.ts` with a caption, a short description, and when to use it. Re-saving the image also strips hidden GPS location data. Only add photos of other people (friends, family) if they're okay with being on a public site.

Bro only states facts about Rabe that are in `argie.ts` (and the photo notes). If something isn't there, Bro asks Rabe instead of guessing.

## 5. Project structure

```
src/
  app/
    api/chat/route.ts            streaming chat endpoint (NDJSON)
    api/conversations/...        list, get, rename, delete, clear
    api/config/route.ts          public, non-secret server info
    layout.tsx, page.tsx, globals.css
  components/                    ChatApp, Sidebar, Composer, MessageBubble, AboutArgie, SettingsModal, …
  lib/
    ai/                          persona prompt + providers (Groq/OpenAI-compatible, Gemini, Anthropic)
    db/                          Postgres store + local-file store
    knowledge/argie.ts           Argie's profile
```

Chat history is private to each browser. An anonymous, httpOnly cookie identifies the visitor, and every database query is filtered by it.
