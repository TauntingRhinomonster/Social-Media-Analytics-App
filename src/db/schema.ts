import { customType, pgTable, text, timestamp, uuid, bigint, integer, jsonb, bigserial, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const EMBEDDING_DIMENSIONS = 1536;

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value: Buffer) {
    return value;
  },
  toDriver(value: Buffer) {
    return value;
  },
});

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${EMBEDDING_DIMENSIONS})`;
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string) {
    return value
      .slice(1, -1)
      .split(",")
      .map((n) => Number.parseFloat(n));
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    platformAccountId: text("platform_account_id").notNull(),
    handle: text("handle").notNull(),
    accessTokenEnc: bytea("access_token_enc").notNull(),
    refreshTokenEnc: bytea("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes").array().notNull().default([]),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("oauth_accounts_user_platform_account_idx").on(
      table.userId,
      table.platform,
      table.platformAccountId,
    ),
    index("oauth_accounts_user_id_idx").on(table.userId),
  ],
);

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => oauthAccounts.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    followers: integer("followers"),
    following: integer("following"),
    impressions: bigint("impressions", { mode: "number" }),
    engagements: bigint("engagements", { mode: "number" }),
    profileViews: integer("profile_views"),
    raw: jsonb("raw"),
  },
  (table) => [
    uniqueIndex("metric_snapshots_account_date_idx").on(
      table.accountId,
      sql`(${table.capturedAt}::date)`,
    ),
    index("metric_snapshots_account_captured_idx").on(table.accountId, table.capturedAt),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => oauthAccounts.id, { onDelete: "cascade" }),
    platformPostId: text("platform_post_id").notNull(),
    content: text("content"),
    mediaUrls: text("media_urls").array().notNull().default([]),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    impressions: bigint("impressions", { mode: "number" }),
    embedding: vector("embedding"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("posts_account_platform_post_idx").on(table.accountId, table.platformPostId),
    index("posts_account_posted_at_idx").on(table.accountId, table.postedAt),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    steps: jsonb("steps").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agent_runs_user_created_idx").on(table.userId, table.createdAt)],
);

export const usersRelations = relations(users, ({ many }) => ({
  oauthAccounts: many(oauthAccounts),
  agentRuns: many(agentRuns),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one, many }) => ({
  user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
  metricSnapshots: many(metricSnapshots),
  posts: many(posts),
}));

export type User = typeof users.$inferSelect;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type MetricSnapshot = typeof metricSnapshots.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
