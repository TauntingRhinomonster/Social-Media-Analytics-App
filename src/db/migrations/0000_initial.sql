-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauth_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "platform" text NOT NULL,
  "platform_account_id" text NOT NULL,
  "handle" text NOT NULL,
  "access_token_enc" bytea NOT NULL,
  "refresh_token_enc" bytea,
  "token_expires_at" timestamptz,
  "scopes" text[] DEFAULT '{}' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_accounts_user_platform_account_idx"
  ON "oauth_accounts" ("user_id", "platform", "platform_account_id");
CREATE INDEX IF NOT EXISTS "oauth_accounts_user_id_idx" ON "oauth_accounts" ("user_id");

CREATE TABLE IF NOT EXISTS "metric_snapshots" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "oauth_accounts"("id") ON DELETE cascade,
  "captured_at" timestamptz DEFAULT now() NOT NULL,
  "followers" integer,
  "following" integer,
  "impressions" bigint,
  "engagements" bigint,
  "profile_views" integer,
  "raw" jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS "metric_snapshots_account_date_idx"
  ON "metric_snapshots" ("account_id", (("captured_at")::date));
CREATE INDEX IF NOT EXISTS "metric_snapshots_account_captured_idx"
  ON "metric_snapshots" ("account_id", "captured_at");

CREATE TABLE IF NOT EXISTS "posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "oauth_accounts"("id") ON DELETE cascade,
  "platform_post_id" text NOT NULL,
  "content" text,
  "media_urls" text[] DEFAULT '{}' NOT NULL,
  "posted_at" timestamptz NOT NULL,
  "likes" integer DEFAULT 0 NOT NULL,
  "comments" integer DEFAULT 0 NOT NULL,
  "shares" integer DEFAULT 0 NOT NULL,
  "impressions" bigint,
  "embedding" vector(1536),
  "raw" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "posts_account_platform_post_idx"
  ON "posts" ("account_id", "platform_post_id");
CREATE INDEX IF NOT EXISTS "posts_account_posted_at_idx"
  ON "posts" ("account_id", "posted_at");

CREATE INDEX IF NOT EXISTS "posts_embedding_hnsw_idx"
  ON "posts" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "prompt" text NOT NULL,
  "steps" jsonb DEFAULT '[]' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_runs_user_created_idx"
  ON "agent_runs" ("user_id", "created_at");
