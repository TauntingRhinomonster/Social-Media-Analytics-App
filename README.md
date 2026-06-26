# Signal — AI-First Social Media Analytics & Action Engine

Backend API for ingesting social media data, storing metrics and vector-embedded posts in PostgreSQL/pgvector, and exposing typed AI tools via the Vercel AI SDK.

## Stack

- **Hono** — HTTP API
- **Drizzle ORM** — Postgres + pgvector (Supabase)
- **Vercel AI SDK** — agent + embeddings
- **Inngest** — daily ingest cron + post scheduling

## Quick Start

```bash
cp .env.example .env
# Fill in DATABASE_URL, TOKEN_ENCRYPTION_KEY, OPENAI_API_KEY, and platform OAuth creds

npm install
npm run dev
```

Generate encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/oauth/:platform/connect` | Start OAuth (x, linkedin, instagram) |
| GET | `/oauth/:platform/callback` | OAuth callback |
| GET | `/accounts` | List connected accounts |
| POST | `/agent/run` | Run analytics agent `{ "prompt": "..." }` |
| GET | `/agent/runs` | Agent run audit log |
| POST | `/dev/ingest/:accountId` | Manual ingest for one account |
| POST | `/dev/embeddings/backfill` | Backfill missing embeddings |
| POST | `/dev/ingest/trigger/:accountId` | Trigger Inngest ingest event |

## AI Tools

- `get_audience_trends` — follower/engagement/impression time-series
- `search_past_posts` — semantic vector search over posts
- `get_top_posts` — ranked best/worst performers
- `get_account_summary` — snapshot across all accounts
- `draft_post` / `schedule_post` — gated write actions (require `confirmed: true`)

## Project Layout

```
src/
  index.ts           — Hono app entry
  env.ts             — typed env config
  db/                — Drizzle schema + migrations
  lib/crypto.ts      — AES-256-GCM token encryption
  platforms/         — X, LinkedIn, Instagram adapters
  ai/                — agent, tools, embeddings
  inngest/           — cron + event functions
  routes/            — HTTP route handlers
  services/          — ingest, accounts
```
