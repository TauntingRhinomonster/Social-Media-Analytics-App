# Repository Table of Contents

> **Instructions for AI agents:** This file is the canonical map of the repository.
> When you create, move, rename, or delete a file, **update this document immediately** — add the new entry in the correct section, remove stale entries, and update any descriptions that have changed.
> Keep entries sorted alphabetically within each section.

---

## How to Read This File

Each entry follows this format:

```
`path/to/file.ext` — One-sentence description of the file's purpose.
```

Directory blocks group related files under a header. Sub-sections are indented under their parent when nesting aids clarity.

---

## Root

| File | Purpose |
|---|---|
| `.env.example` | Template of all required environment variables. Copy to `.env` and fill values before running. |
| `.gitignore` | Git ignore rules (node_modules, dist, .env, logs). |
| `drizzle.config.ts` | Drizzle Kit config — points to schema and migrations output directory. |
| `package.json` | NPM manifest: scripts (dev, build, db:*, test, test:watch, test:coverage, test:crypto), production and dev dependencies. |
| `README.md` | Project overview, quick-start instructions, full API endpoint reference, and project layout summary. |
| `tsconfig.json` | TypeScript compiler options (ESM, NodeNext module resolution, strict mode). |
| `vitest.config.ts` | Vitest configuration — includes `src/**/*.vitest.ts`, v8 coverage provider, node environment. |

---

## `agents/` — Project-Scoped Agent Skills

Skills live under `agents/Skills/`. Each skill is a folder containing a `SKILL.md` file.

| File | Purpose |
|---|---|
| `agents/Skills/create-story/SKILL.md` | Skill for creating feature story markdown files. Triggered by `/story` or requests to create a new story. Guides the agent through gathering inputs, scoping, writing all 19 sections, saving to `docs/features/`, and updating this TOC. |
| `agents/Skills/qa-testing/SKILL.md` | Skill for generating Vitest test files before each story or implementation task. Triggered by `/qa` or whenever a new feature is scoped. Produces AAA-pattern tests covering happy paths and edge/error paths for utilities, platform adapters, services, routes, and AI tools. |

---

## `.cursor/` — Cursor IDE Workspace Metadata

| File | Purpose |
|---|---|
| `.cursor/dir/TABLE_OF_CONTENTS.md` | **This file.** Canonical repository map for AI agents. Update whenever files are added, moved, or removed. |
| `.cursor/plans/ai_social_analytics_engine_ed740e62.plan.md` | Full project blueprint: architecture, DB schema, AI tool definitions, and 3-phase implementation plan with to-do tracking. |

---

## `docs/` — Feature Documentation

### `docs/features/`

Feature planning lives here. Each **subfolder** represents a larger feature group. Each **markdown file** inside is a "story" — an independently deployable feature.

| File | Purpose |
|---|---|
| `docs/features/feature1/_TEMPLATE.md` | Story template. Copy this file when creating a new story and fill every section (Metadata, Problem Statement, Goals, Acceptance Criteria, etc.). Do **not** edit the template itself. |

### `docs/features/auth/`

Authentication and social platform integration stories.

| File | Purpose |
|---|---|
| `docs/features/auth/1.1_twitter_oauth.md` | Story 1.1: Twitter/X OAuth 2.0 with PKCE, encrypted token persistence, token refresh, and internal endpoints for downstream services. Unblocks data fetch (1.2) and LLM action tools (1.3). |

> **AI agent note:** When a new story is created, add it here under its feature subfolder with a one-line description of the story's scope.

---

## `src/` — Application Source

### `src/index.ts`

`src/index.ts` — Hono application entry point. Mounts all route handlers, runs DB migrations on startup, registers Inngest serve endpoint, and starts the Node HTTP server.

---

### `src/env.ts`

`src/env.ts` — Zod schema for all environment variables. Call `loadEnv()` to get a typed, validated config object. Throws at startup if required vars are missing.

---

### `src/db/` — Database Layer

| File | Purpose |
|---|---|
| `src/db/index.ts` | Creates and caches the `postgres` connection pool and Drizzle client. Exports `getDb()`, `closeDb()`, and `ensureExtensions()` (enables `vector` and `pgcrypto`). |
| `src/db/schema.ts` | Drizzle table definitions: `users`, `oauth_accounts`, `metric_snapshots`, `posts`, `agent_runs`. Includes custom `bytea` and `vector(1536)` column types. Exports TypeScript inferred types for every table. |
| `src/db/migrations/0000_initial.sql` | Raw SQL migration: enables pgvector + pgcrypto, creates all tables, unique indexes, and the HNSW vector index on `posts.embedding`. Runs automatically on server startup. |

---

### `src/lib/` — Shared Utilities

| File | Purpose |
|---|---|
| `src/lib/crypto.ts` | AES-256-GCM token encryption/decryption. `encryptToken(plaintext, key)` returns a `Buffer` (IV + auth tag + ciphertext). `decryptToken(buffer, key)` reverses it. Key must be a 32-byte base64 string. |
| `src/lib/crypto.test.ts` | Legacy standalone smoke test for the crypto helpers (run with `npm run test:crypto`). Asserts round-trip encrypt → decrypt equality. |
| `src/lib/crypto.vitest.ts` | Vitest suite for `encryptToken` and `decryptToken`. Covers happy paths (round-trip, random IV), edge cases (empty string, long token, unicode), and error paths (wrong key, truncated payload, tampered ciphertext). |

---

### `src/platforms/` — Social Platform Adapters

Each adapter implements the `PlatformAdapter` interface and normalises platform-specific API responses into the shared `NormalizedAccountMetrics` and `NormalizedPost` shapes.

| File | Purpose |
|---|---|
| `src/platforms/types.ts` | Core interfaces: `PlatformAdapter`, `OAuthTokens`, `PlatformAccountInfo`, `NormalizedAccountMetrics`, `NormalizedPost`. All adapters and services depend on these types. |
| `src/platforms/index.ts` | `getPlatformAdapter(platform, env)` factory — returns the correct adapter by platform ID. `getAllPlatformAdapters(env)` returns all configured adapters. |
| `src/platforms/x.ts` | X (Twitter) OAuth 2.0 adapter. Implements authorization URL, code exchange (with PKCE), token refresh, account metrics, and recent tweets fetch. |
| `src/platforms/x.vitest.ts` | Vitest suite for the X adapter. Covers auth URL construction, metrics normalization, empty-timeline edge cases, and HTTP error propagation (401, 429, 503). |
| `src/platforms/linkedin.ts` | LinkedIn OAuth 2.0 adapter. Implements authorization URL, code exchange, token refresh, org follower metrics, and UGC post fetch. |
| `src/platforms/instagram.ts` | Instagram (Meta Graph API) adapter. Implements Facebook OAuth, linked Instagram Business account lookup, follower metrics, and media fetch. |

---

### `src/services/` — Business Logic Services

| File | Purpose |
|---|---|
| `src/services/accounts.ts` | Account helpers: `getOrCreateDefaultUser()`, `getAccessToken()` (auto-refreshes if expired), `refreshAccountToken()`, `getAccountForUser()`, `getUserAccounts()`. |
| `src/services/ingest.ts` | `ingestAccount(accountId, env)` — full ingest pipeline for one account: refresh token → fetch metrics → fetch posts → upsert to DB → trigger embeddings. `ingestAllActiveAccounts(env)` fans out to all active accounts. |

---

### `src/ai/` — AI Agent & Tools

| File | Purpose |
|---|---|
| `src/ai/agent.ts` | `runAgent(userId, prompt, env)` — runs the Vercel AI SDK `generateText` loop with all tools, saves the run to `agent_runs`, and returns the text + step audit. Model: `gpt-4o-mini`, max 8 steps. |
| `src/ai/embeddings.ts` | `embedText(text, env)` — single text embedding via `text-embedding-3-small`. `embedPostsWithoutEmbeddings(accountId, env)` — batch embeds posts missing a vector. `backfillAllEmbeddings(env)` — backfills across all accounts. |
| `src/ai/tools/index.ts` | All 6 Zod-typed AI tools returned by `createTools(userId, env)`: `get_audience_trends`, `search_past_posts`, `get_top_posts`, `get_account_summary`, `draft_post`, `schedule_post`. |

---

### `src/inngest/` — Background Jobs

| File | Purpose |
|---|---|
| `src/inngest/client.ts` | Inngest client singleton (`new Inngest({ id: "signal-analytics" })`). Import `inngest` everywhere events need to be sent. |
| `src/inngest/functions.ts` | Three Inngest functions: `dailyIngestCron` (6 AM daily, fans out per account), `ingestAccountEvent` (on-demand per-account ingest), `schedulePostEvent` (sleeps until `scheduledAt`, then publishes). |

---

### `src/routes/` — HTTP Route Handlers

| File | Purpose |
|---|---|
| `src/routes/oauth.ts` | `createOAuthRoutes(env)` — `GET /oauth/:platform/connect` (redirects to platform auth URL) and `GET /oauth/:platform/callback` (exchanges code, stores encrypted tokens). `createAccountsRoutes(env)` — `GET /accounts`. |
| `src/routes/agent.ts` | `createAgentRoutes(env)` — `POST /agent/run` accepts `{ prompt }`, runs the agent loop, returns text + step log. |
| `src/routes/agent.vitest.ts` | Vitest suite for `POST /agent/run`. Covers 200 success, user ID forwarding, missing/empty prompt (400), malformed JSON (400), and upstream agent failure (500). |
| `src/routes/dev.ts` | `createDevRoutes(env)` — dev/ops utilities: `POST /dev/ingest/:accountId`, `POST /dev/embeddings/backfill`, `POST /dev/ingest/trigger/:accountId`, `GET /dev/accounts/:accountId/status`. `createHistoryRoutes(env)` — `GET /agent/runs`. |

---

## `dist/` — Compiled Output

> Auto-generated by `npm run build` (TypeScript → JavaScript). **Do not edit manually.** Not committed to git.

---

## Maintenance Checklist for AI Agents

When you create a **new file**, do the following:
1. Add an entry to the correct section above with a one-sentence description.
2. If the file belongs to a new directory that doesn't exist in this TOC, add a new section header for it.

When you **rename or move** a file:
1. Update the path in every entry that references it.

When you **delete** a file:
1. Remove its entry from this TOC entirely.

When you create a **new feature story** under `docs/features/`:
1. Add it under the `docs/features/` section with the subfolder name and a one-line scope summary.
