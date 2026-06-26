---
name: create-story
description: >-
  Creates feature story markdown files for the AI-First Social Media Analytics
  & Action Engine. Each story is an independently deployable feature plan saved
  under docs/features/<feature-group>/<id>_<slug>.md and follows the project's
  19-section story template. Use when the user asks to create a new story,
  feature plan, or feature spec, or when invoked via /story.
---

# Create Story

Generates a complete, independently deployable feature story for this project.

## Project Context

- **Project**: AI-First Social Media Analytics & Action Engine — backend-only toolset that authenticates social accounts, fetches data via official APIs, stores metrics and vector embeddings, and exposes typed AI tools to an LLM agent.
- **Stack**: Hono, TypeScript, Drizzle ORM, Supabase Postgres + pgvector, Vercel AI SDK, Inngest.
- **Existing source files**: see `.cursor/dir/TABLE_OF_CONTENTS.md` for a full file map.

## What a Story Is

A story is a single markdown file representing one **independently deployable feature**. It must be narrow enough to ship alone but deliver complete end-to-end value.

## Workflow

### Step 1 — Gather inputs

Ask the user for the following if not already provided:

1. **Feature group** (subfolder under `docs/features/`) — e.g., `auth`, `ingest`, `ai-tools`, `data-model`
2. **Feature ID** — e.g., `1.2`, `2.3`
3. **Story title** — short, action-oriented name
4. **Story concept** — one to three sentences on what this story achieves

If the user provides a concept but no ID or group, infer reasonable values and confirm before writing.

### Step 2 — Check scope

Before drafting, verify the story is independently deployable:
- Can it ship without other unfinished stories?
- Does it deliver testable, end-to-end value on its own?
- Is it too large? If it touches more than 3–4 source modules or exceeds ~4 weeks effort, propose splitting it.

### Step 3 — Write the story

Follow the **exact 19-section structure** below. Do not skip or rename sections. Use the canonical example (`docs/features/auth/1.1_twitter_oauth.md`) as the quality bar.

### Step 4 — Save the file

Save to:
```
docs/features/<feature-group>/<id>_<slug>.md
```

Where `<slug>` is a lowercase, hyphen-separated version of the title (e.g., `linkedin_oauth_connection`).

### Step 5 — Update TABLE_OF_CONTENTS.md

Add the new story entry to `.cursor/dir/TABLE_OF_CONTENTS.md` under `docs/features/<feature-group>/` with a one-line scope summary. If the feature group subfolder section does not yet exist in the TOC, create it.

---

## Story Structure (19 Sections)

Output the story exactly in this format. Fill every section — write N/A for genuinely non-applicable items rather than omitting them.

```markdown
# {Feature ID} — {Feature Name}

> Implementation plan. Source: docs/features/{group}/{id}_{slug}.md

## Metadata

| Field | Value |
| --- | --- |
| **Feature ID** | {e.g. 1.2} |
| **Section** | {e.g. Data Ingestion} |
| **Severity** | BLOCKER | MAJOR | MINOR |
| **Markets** | Enterprise / Prosumer |
| **Status (today)** | MISSING | PARTIAL | THIN |
| **Estimated effort** | XS (≤1d) | S (1w) | M (2–4w) | L (1–2mo) | XL (>2mo) |
| **Owner (proposed)** | {team / individual} |
| **Depends on** | {Feature IDs that must ship first, or "None"} |
| **Unblocks** | {Feature IDs this enables, or "None"} |

---

## 1. Problem Statement

2–4 sentences. What is missing today, who is affected, and what outcome does fixing it create?

## 2. Goals

- Bullet list of 3–5 outcomes the work must achieve.

## 3. Non-Goals

- Explicit out-of-scope items to prevent scope creep.

## 4. Personas & User Stories

- **As a {role}**, I want to {action} so that {value}.

## 5. Functional Requirements

- **FR-1.** The system MUST …
- **FR-2.** The system MUST …
- **FR-3.** The system SHOULD …

## 6. Non-Functional Requirements

- **Performance** — p95 latency targets, throughput.
- **Security** — authn/authz model, encryption.
- **Privacy & Compliance** — relevant obligations.
- **Accessibility** — N/A (backend-only) or WCAG notes.
- **Scalability** — expected load.
- **Reliability** — availability target, failure modes, idempotency.
- **Observability** — required metrics, log fields, alerts.
- **Maintainability** — module ownership, conventions.
- **Internationalization** — N/A or notes.
- **Backward compatibility** — migration/deprecation policy.

## 7. Acceptance Criteria

- **AC-1.** *Given* … *When* … *Then* …
- **AC-2.** *Given* … *When* … *Then* …

## 8. Data Model

- New tables / columns / enums, or "No schema changes."
- Indexes & constraints.
- Migration file name (e.g., `src/db/migrations/0001_*.sql`).
- Backfill strategy.

## 9. API Surface

- New / changed HTTP routes (path, verb, auth scope).
- Request & response shapes.
- Rate-limit considerations.
- OpenAPI requirement.

## 10. UI / UX

- **Note**: Backend-only toolset — no GUI unless explicitly scoped.
- Key user flows or "N/A."
- Error / empty states exposed via API.

## 11. AI / ML Considerations

- Model(s) used, prompts, eval metric, fallback, PII handling, cost budget.
- Write "N/A" if not AI-touching.

## 12. Integration Points

- External services / APIs touched (with versions).
- Internal modules touched (with file paths from TABLE_OF_CONTENTS.md).
- Webhook / event emissions.

## 13. Dependencies & Sequencing

- Must ship after: {Feature IDs or "None"}.
- Must ship before: {Feature IDs or "None"}.
- Shared infra needed: job queue, KMS, object storage, etc.

## 14. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| … | L/M/H | L/M/H | … |

## 15. Rollout Plan

- Feature flag name & default state.
- Migration sequencing (schema → backfill → code → flip flag).
- Dogfood / pilot cohort.
- GA criteria.
- Rollback path.

## 16. Test Plan

- **Unit** — what is covered.
- **Integration** — DB / API scenarios.
- **End-to-end** — happy paths + edge cases.
- **Security** — authz matrix, abuse cases.
- **Performance / load** — tooling and pass criteria.
- **Manual exploratory** — QA checklists.

## 17. Documentation & Training

- API reference updates.
- Internal runbook updates.
- "None" if not applicable.

## 18. Open Questions

1. {Numbered list of unresolved decisions.}

## 19. References

- Existing files this work touches: {paths from TABLE_OF_CONTENTS.md}.
- External standards: {RFCs, specs, etc.}.
- Related plans: {paths to sibling story files}.

---
```

---

## Quality Bar

Before saving, verify:

- [ ] Story is independently deployable (can ship alone)
- [ ] All 19 sections present, none skipped or renamed
- [ ] Functional requirements use MUST / SHOULD / MAY
- [ ] Acceptance criteria are Given/When/Then
- [ ] Internal file paths reference files listed in `TABLE_OF_CONTENTS.md`
- [ ] `TABLE_OF_CONTENTS.md` updated with new story entry
- [ ] File saved to `docs/features/<group>/<id>_<slug>.md`

## Reference

Canonical example: `docs/features/auth/1.1_twitter_oauth.md`
Full file map: `.cursor/dir/TABLE_OF_CONTENTS.md`
