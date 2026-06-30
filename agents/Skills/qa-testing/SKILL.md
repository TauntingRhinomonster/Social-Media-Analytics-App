---
name: qa-testing
description: >-
  Generates Vitest test files for the AI-First Social Media Analytics & Action Engine
  before each story or implementation plan is written. Each test file follows the
  AAA (Arrange, Act, Assert) pattern, covers both the happy path and edge/failure
  paths, and targets only testable units. Invoked via /qa or whenever a new story,
  feature plan, or implementation task is scoped.
---

# QA Testing Skill

Produces a complete, ready-to-run test file for a feature **before** implementation begins, ensuring every deliverable has a verifiable acceptance bar.

---

## When to Invoke This Skill

Run this skill **before** writing any implementation code for:

- A new story created by the `create-story` skill
- Any functional requirement from a story's **Section 5 (Functional Requirements)** or **Section 7 (Acceptance Criteria)**
- Any new route, service function, utility, or platform adapter

**Do not** invoke this skill for:

- Pure configuration files (e.g., `drizzle.config.ts`, `tsconfig.json`, `vitest.config.ts`)
- Database schema migrations (untestable without a live DB; use integration tests at the service layer instead)
- Environment variable parsing (`src/env.ts`) — this is already validated at startup via Zod
- Inngest background function internals that require a live Inngest server — test the service functions those jobs call instead

---

## Project Context

- **Stack**: TypeScript (ESM, NodeNext), Hono, Drizzle ORM, Supabase Postgres + pgvector, Vercel AI SDK, Inngest, Zod
- **Test runner**: Vitest (`npm test` → `vitest run`; `npm run test:watch` → `vitest`)
- **File convention**: `*.vitest.ts` for Vitest suites; `*.test.ts` is reserved for the legacy standalone crypto script
- **Existing tests**: `src/lib/crypto.vitest.ts` (crypto round-trip)
- **File map**: `.cursor/dir/TABLE_OF_CONTENTS.md`

---

## The AAA Pattern

Every `it`/`test` block **must** follow Arrange → Act → Assert, with a blank line separating each phase:

```typescript
it("description of expected behavior", async () => {
  // Arrange — set up inputs, mocks, dependencies
  const input = { ... };
  const mockDep = vi.fn().mockResolvedValue({ ... });

  // Act — call the function under test
  const result = await functionUnderTest(input, mockDep);

  // Assert — verify the outcome
  expect(result).toEqual({ ... });
});
```

Never collapse the three phases into a single expression. Even one-liner asserts benefit from explicit labeling when the test grows later.

---

## Coverage Targets per Module Type

### 1. Utility Functions (`src/lib/`)

Test every exported function. Utilities are pure or near-pure — no DB, no HTTP — so mocking is minimal.

**Paths to cover**:
- ✅ Happy path: valid inputs → correct output
- ✅ Edge: boundary values (empty string, zero-length buffer, max-size input)
- ✅ Error: invalid key length, corrupted ciphertext, wrong type

**Template** (`src/lib/example.vitest.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { myUtil } from "./example.js";

describe("myUtil", () => {
  describe("happy path", () => {
    it("returns the processed result for valid input", () => {
      // Arrange
      const input = "valid-input";

      // Act
      const result = myUtil(input);

      // Assert
      expect(result).toBe("expected-output");
    });
  });

  describe("edge cases", () => {
    it("handles an empty string without throwing", () => {
      // Arrange
      const input = "";

      // Act
      const result = myUtil(input);

      // Assert
      expect(result).toBe("");
    });
  });

  describe("error paths", () => {
    it("throws when input is null", () => {
      // Arrange
      const input = null as unknown as string;

      // Act & Assert (combined only when the act IS the throw)
      expect(() => myUtil(input)).toThrow("expected error message");
    });
  });
});
```

---

### 2. Platform Adapters (`src/platforms/`)

Adapters call external HTTP APIs. Mock `fetch` with `vi.spyOn(global, "fetch")` or inject a typed mock. Never make real API calls in unit tests.

**Paths to cover**:
- ✅ Happy path: platform returns valid payload → adapter returns `NormalizedAccountMetrics` / `NormalizedPost[]`
- ✅ Edge: platform returns empty posts array → adapter returns `[]`
- ✅ Error: platform returns 401 → adapter throws or returns error token response
- ✅ Error: platform returns malformed JSON → adapter throws

**Template** (`src/platforms/x.vitest.ts`):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { XAdapter } from "./x.js";
import type { Env } from "../env.js";

const mockEnv = {
  X_CLIENT_ID: "test-client-id",
  X_CLIENT_SECRET: "test-client-secret",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
} as unknown as Env;

describe("XAdapter.fetchAccountMetrics", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("happy path", () => {
    it("normalizes a valid Twitter API response to NormalizedAccountMetrics", async () => {
      // Arrange
      const rawApiResponse = {
        data: { public_metrics: { followers_count: 1200, following_count: 300 } },
      };
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(rawApiResponse), { status: 200 })
      );
      const adapter = new XAdapter(mockEnv);

      // Act
      const result = await adapter.fetchAccountMetrics("token-abc", "user-123");

      // Assert
      expect(result.followers).toBe(1200);
      expect(result.following).toBe(300);
    });
  });

  describe("error paths", () => {
    it("throws when the platform returns 401 Unauthorized", async () => {
      // Arrange
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
      );
      const adapter = new XAdapter(mockEnv);

      // Act & Assert
      await expect(
        adapter.fetchAccountMetrics("bad-token", "user-123")
      ).rejects.toThrow();
    });
  });
});
```

---

### 3. Service Functions (`src/services/`)

Services coordinate DB access and adapters. Inject a mocked DB (`vi.mock("../db/index.js")`) and mock any adapter methods.

**Paths to cover**:
- ✅ Happy path: account exists, token valid → ingest pipeline completes, DB upsert called with correct args
- ✅ Edge: token is expired → `getAccessToken` triggers refresh before continuing
- ✅ Edge: account has zero posts → embedding step skipped or receives empty array
- ✅ Error: DB upsert throws → service propagates or wraps the error

**Template** (`src/services/ingest.vitest.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ingestAccount } from "./ingest.js";
import * as dbModule from "../db/index.js";
import * as accountsModule from "./accounts.js";

vi.mock("../db/index.js");
vi.mock("./accounts.js");

describe("ingestAccount", () => {
  const mockEnv = { /* minimal env shape */ } as any;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("happy path", () => {
    it("fetches metrics, upserts posts, and returns without error when all dependencies succeed", async () => {
      // Arrange
      vi.mocked(accountsModule.getAccessToken).mockResolvedValue("valid-token");
      const mockDb = { insert: vi.fn().mockReturnThis(), values: vi.fn().mockReturnThis(), onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(dbModule.getDb).mockReturnValue(mockDb as any);

      // Act
      await ingestAccount("account-uuid", mockEnv);

      // Assert
      expect(accountsModule.getAccessToken).toHaveBeenCalledWith("account-uuid", mockEnv);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("error paths", () => {
    it("throws when getAccessToken rejects (e.g. revoked token)", async () => {
      // Arrange
      vi.mocked(accountsModule.getAccessToken).mockRejectedValue(new Error("Token revoked"));

      // Act & Assert
      await expect(ingestAccount("account-uuid", mockEnv)).rejects.toThrow("Token revoked");
    });
  });
});
```

---

### 4. HTTP Routes (`src/routes/`)

Use Hono's built-in test utilities to dispatch requests without spinning up a real server. No live DB or HTTP calls.

**Paths to cover**:
- ✅ Happy path: valid request body → correct JSON response + status 200/201
- ✅ Edge: missing required field in request body → 400 with descriptive error
- ✅ Edge: `platform` path param is unknown → 400 or 404
- ✅ Error: underlying service throws → 500 with error body (no stack trace leaked)

**Template** (`src/routes/agent.vitest.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgentRoutes } from "./agent.js";
import * as agentModule from "../ai/agent.js";

vi.mock("../ai/agent.js");

describe("POST /agent/run", () => {
  const mockEnv = {} as any;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("happy path", () => {
    it("returns 200 with text and steps when the agent completes successfully", async () => {
      // Arrange
      vi.mocked(agentModule.runAgent).mockResolvedValue({
        text: "Here are your analytics.",
        steps: [],
      });
      const app = createAgentRoutes(mockEnv);
      const req = new Request("http://localhost/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "What are my top posts?" }),
      });

      // Act
      const res = await app.fetch(req);
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body.text).toBe("Here are your analytics.");
    });
  });

  describe("error paths", () => {
    it("returns 400 when prompt is missing from the request body", async () => {
      // Arrange
      const app = createAgentRoutes(mockEnv);
      const req = new Request("http://localhost/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Act
      const res = await app.fetch(req);

      // Assert
      expect(res.status).toBe(400);
    });

    it("returns 500 when the agent throws an unexpected error", async () => {
      // Arrange
      vi.mocked(agentModule.runAgent).mockRejectedValue(new Error("OpenAI timeout"));
      const app = createAgentRoutes(mockEnv);
      const req = new Request("http://localhost/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "What are my top posts?" }),
      });

      // Act
      const res = await app.fetch(req);

      // Assert
      expect(res.status).toBe(500);
    });
  });
});
```

---

### 5. AI Tools (`src/ai/tools/`)

Tools are plain async functions that receive typed input + DB access. Inject a mock DB. Assert the SQL query shape, not raw SQL strings — check what data is passed to the Drizzle query builder.

**Paths to cover**:
- ✅ Happy path: DB returns rows → tool returns correctly shaped JSON
- ✅ Edge: DB returns empty result set → tool returns `[]` or a zero-filled summary
- ✅ Error: DB throws → tool propagates the error (agent handles it as a tool failure)
- ✅ Security: tool only queries rows matching `userId` (no cross-tenant leakage)

**Template** (`src/ai/tools/get_top_posts.vitest.ts`):

```typescript
import { describe, it, expect, vi } from "vitest";
import { createTools } from "./index.js";

describe("get_top_posts tool", () => {
  const userId = "user-abc";
  const mockEnv = {} as any;

  describe("happy path", () => {
    it("returns ranked posts ordered by likes descending", async () => {
      // Arrange
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          { id: "post-1", content: "Hello world", likes: 500 },
          { id: "post-2", content: "Another post", likes: 200 },
        ]),
      };
      vi.mock("../../db/index.js", () => ({ getDb: () => mockDb }));
      const tools = createTools(userId, mockEnv);

      // Act
      const result = await tools.get_top_posts.execute({
        accountId: "acct-1",
        metric: "likes",
        period: "7d",
        limit: 2,
        order: "top",
      });

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].likes).toBeGreaterThanOrEqual(result[1].likes);
    });
  });

  describe("edge cases", () => {
    it("returns an empty array when no posts exist in the period", async () => {
      // Arrange
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      vi.mock("../../db/index.js", () => ({ getDb: () => mockDb }));
      const tools = createTools(userId, mockEnv);

      // Act
      const result = await tools.get_top_posts.execute({
        accountId: "acct-1",
        metric: "likes",
        period: "30d",
        limit: 5,
        order: "top",
      });

      // Assert
      expect(result).toEqual([]);
    });
  });
});
```

---

## Workflow

### Step 1 — Identify what is being built

Read the story's **Section 5 (Functional Requirements)** and **Section 7 (Acceptance Criteria)**.  
Map each testable AC to one or more `it` blocks. Skip ACs that are configuration-only or require a live external service.

### Step 2 — Classify the module type

Determine which template above applies (utility, adapter, service, route, AI tool). Use the correct mock strategy for that layer.

### Step 3 — List test cases before writing code

Write out the case descriptions **first**, one line per `it`, covering:

| Direction | Description |
|-----------|-------------|
| **Happy path** ("path of least resistance") | The nominal user flow with valid inputs and all dependencies succeeding. This is the primary usage path — the one most users will hit most of the time. |
| **Edge cases** ("road less traveled") | Valid but boundary-pushing inputs: empty arrays, zero values, maximum sizes, optional fields omitted. |
| **Error paths** ("road less traveled") | Invalid inputs, upstream failures, unexpected exceptions. Cover the paths that are rare but catastrophic if untested. |

### Step 4 — Write the test file

- File location: same directory as the source file, named `<module>.vitest.ts`
- Import from `.js` extensions (NodeNext ESM resolution)
- Use `describe` to group by function name, nested `describe` for direction (happy / edge / error)
- Mock only what crosses a layer boundary (DB, HTTP, external SDK); do not mock the function under test
- Each `it` is self-contained — no shared mutable state between tests; use `beforeEach` to reset mocks

### Step 5 — Validate the test file compiles

Run:

```bash
npm test -- --reporter=verbose
```

Fix any TypeScript or import errors before handing the test file off as the acceptance bar for implementation.

### Step 6 — Update TABLE_OF_CONTENTS.md

Add the new `*.vitest.ts` entry next to its source file in `.cursor/dir/TABLE_OF_CONTENTS.md`.

---

## Testability Decision Matrix

Use this table to decide whether to write a test for a given unit:

| Unit | Testable? | Approach |
|------|-----------|----------|
| `src/lib/crypto.ts` | ✅ Yes | Pure function, no mocks needed |
| `src/platforms/x.ts` — HTTP fetch | ✅ Yes | Mock `global.fetch` |
| `src/services/ingest.ts` — pipeline | ✅ Yes | Mock DB + adapter |
| `src/services/accounts.ts` — token refresh | ✅ Yes | Mock DB + adapter |
| `src/routes/*.ts` — HTTP handlers | ✅ Yes | Hono `app.fetch()` in-process |
| `src/ai/tools/index.ts` — tool execute | ✅ Yes | Mock DB |
| `src/ai/agent.ts` — LLM loop | ⚠️ Partial | Mock `generateText`; assert prompt/tools shape |
| `src/ai/embeddings.ts` — embedding call | ⚠️ Partial | Mock `embedMany`; assert batch inputs |
| `src/inngest/functions.ts` | ⚠️ Partial | Test the service functions they delegate to; skip Inngest step orchestration |
| `src/db/schema.ts` | ❌ No | Pure type declarations, no runtime logic |
| `src/db/migrations/*.sql` | ❌ No | DDL; validated by Drizzle at schema-gen time |
| `src/env.ts` — Zod env parsing | ❌ No | Validated at startup; test via service integration tests |
| `drizzle.config.ts` / `tsconfig.json` | ❌ No | Configuration |

---

## Naming Conventions

| What | Convention |
|------|------------|
| Test file | `<module>.vitest.ts` co-located with source |
| Top-level describe | `"<FunctionName>"` or `"<ClassName>"` |
| Direction grouping | `"happy path"` / `"edge cases"` / `"error paths"` |
| Individual test | `"<verb> <expected result> when <condition>"` |
| Mock variables | `mock<Dependency>` (e.g., `mockDb`, `mockAdapter`, `mockEnv`) |

---

## Quality Bar

Before marking a test file done, verify:

- [ ] Every testable acceptance criterion from the story has at least one `it` block
- [ ] Each `it` follows AAA with a blank line between phases
- [ ] Happy path is covered for every exported function
- [ ] At least one edge/error path is covered per function
- [ ] Mocks are reset or restored in `beforeEach` / `afterEach`
- [ ] No real HTTP calls, real DB queries, or real OpenAI calls in any test
- [ ] `npm test` passes with exit code 0 and no TypeScript errors
- [ ] New test file is added to `TABLE_OF_CONTENTS.md`

---

## Reference

- Test runner config: `vitest.config.ts` (root)
- Existing test example: `src/lib/crypto.vitest.ts`
- Full file map: `.cursor/dir/TABLE_OF_CONTENTS.md`
- Story template: `agents/Skills/create-story/SKILL.md`
- Feature stories: `docs/features/`
