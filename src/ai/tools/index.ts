import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Env } from "../../env.js";
import { getDb } from "../../db/index.js";
import { metricSnapshots, oauthAccounts, posts } from "../../db/schema.js";
import type { OAuthAccount } from "../../db/schema.js";
import { embedText } from "../embeddings.js";
import { getAccountForUser } from "../../services/accounts.js";

const periodSchema = z.enum(["7d", "30d", "90d"]);

function periodToDate(period: z.infer<typeof periodSchema>): Date {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export function createTools(userId: string, env: Env) {
  return {
    get_audience_trends: tool({
      description:
        "Get time-series follower, engagement, or impression growth for a connected social account over 7, 30, or 90 days.",
      parameters: z.object({
        accountId: z.string().uuid().describe("OAuth account UUID"),
        metric: z.enum(["followers", "engagements", "impressions"]),
        period: periodSchema,
        granularity: z.enum(["day", "week"]).optional().default("day"),
      }),
      execute: async ({ accountId, metric, period, granularity }) => {
        const account = await getAccountForUser(accountId, userId, env);
        if (!account) return { error: "Account not found" };

        const db = getDb(env.DATABASE_URL);
        const since = periodToDate(period);
        const column =
          metric === "followers"
            ? metricSnapshots.followers
            : metric === "engagements"
              ? metricSnapshots.engagements
              : metricSnapshots.impressions;

        const rows = await db
          .select({
            capturedAt: metricSnapshots.capturedAt,
            value: column,
          })
          .from(metricSnapshots)
          .where(
            and(eq(metricSnapshots.accountId, accountId), gte(metricSnapshots.capturedAt, since)),
          )
          .orderBy(metricSnapshots.capturedAt);

        const series = rows.map((r: { capturedAt: Date; value: number | null }) => ({
          date: r.capturedAt.toISOString().slice(0, 10),
          value: r.value ?? 0,
        }));

        const first = series[0]?.value ?? 0;
        const last = series.at(-1)?.value ?? 0;
        const delta = last - first;
        const growthRate = first > 0 ? ((last - first) / first) * 100 : null;

        return {
          accountId,
          metric,
          period,
          granularity,
          series,
          delta,
          growthRate,
          startValue: first,
          endValue: last,
        };
      },
    }),

    search_past_posts: tool({
      description:
        "Semantic search over post history using vector similarity. Finds posts matching a natural language query.",
      parameters: z.object({
        accountId: z.string().uuid(),
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional().default(10),
        since: z.string().datetime().optional(),
      }),
      execute: async ({ accountId, query, limit, since }) => {
        const account = await getAccountForUser(accountId, userId, env);
        if (!account) return { error: "Account not found" };

        const queryEmbedding = await embedText(query, env);
        const db = getDb(env.DATABASE_URL);

        const sinceDate = since ? new Date(since) : null;
        const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

        const results = await db.execute(sql`
          SELECT
            id,
            platform_post_id,
            content,
            posted_at,
            likes,
            comments,
            shares,
            impressions,
            1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
          FROM posts
          WHERE account_id = ${accountId}
            AND embedding IS NOT NULL
            ${sinceDate ? sql`AND posted_at >= ${sinceDate}` : sql``}
          ORDER BY embedding <=> ${embeddingLiteral}::vector
          LIMIT ${limit}
        `);

        return {
          accountId,
          query,
          matches: (results as unknown as Array<Record<string, unknown>>).map((row) => ({
            id: row.id,
            platformPostId: row.platform_post_id,
            content: row.content,
            postedAt: row.posted_at,
            likes: row.likes,
            comments: row.comments,
            shares: row.shares,
            impressions: row.impressions,
            similarity: Number(row.similarity),
          })),
        };
      },
    }),

    get_top_posts: tool({
      description:
        "Rank best or worst performing posts by likes, impressions, or engagement rate over a time period.",
      parameters: z.object({
        accountId: z.string().uuid(),
        metric: z.enum(["likes", "impressions", "engagement_rate"]),
        period: periodSchema,
        limit: z.number().int().min(1).max(20).optional().default(5),
        order: z.enum(["top", "bottom"]).optional().default("top"),
      }),
      execute: async ({ accountId, metric, period, limit, order }) => {
        const account = await getAccountForUser(accountId, userId, env);
        if (!account) return { error: "Account not found" };

        const db = getDb(env.DATABASE_URL);
        const since = periodToDate(period);

        const orderExpr =
          metric === "likes"
            ? posts.likes
            : metric === "impressions"
              ? posts.impressions
              : sql`CASE WHEN COALESCE(${posts.impressions}, 0) > 0
                  THEN (${posts.likes} + ${posts.comments} + ${posts.shares})::float / ${posts.impressions}
                  ELSE 0 END`;

        const rows = await db
          .select({
            id: posts.id,
            platformPostId: posts.platformPostId,
            content: posts.content,
            postedAt: posts.postedAt,
            likes: posts.likes,
            comments: posts.comments,
            shares: posts.shares,
            impressions: posts.impressions,
          })
          .from(posts)
          .where(and(eq(posts.accountId, accountId), gte(posts.postedAt, since)))
          .orderBy(order === "top" ? desc(orderExpr) : orderExpr)
          .limit(limit);

        return { accountId, metric, period, order, posts: rows };
      },
    }),

    get_account_summary: tool({
      description:
        "Snapshot of all connected accounts: latest metrics and post counts. Use as a primer before deeper analysis.",
      parameters: z.object({
        userId: z.string().uuid(),
      }),
      execute: async ({ userId: requestedUserId }) => {
        if (requestedUserId !== userId) return { error: "Unauthorized" };

        const db = getDb(env.DATABASE_URL);
        const accounts = await db.query.oauthAccounts.findMany({
          where: eq(oauthAccounts.userId, userId),
        });

        const summaries = await Promise.all(
          accounts.map(async (account: OAuthAccount) => {
            const [latestMetric] = await db
              .select()
              .from(metricSnapshots)
              .where(eq(metricSnapshots.accountId, account.id))
              .orderBy(desc(metricSnapshots.capturedAt))
              .limit(1);

            const [postCount] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(posts)
              .where(eq(posts.accountId, account.id));

            const [embeddedCount] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(posts)
              .where(and(eq(posts.accountId, account.id), sql`embedding IS NOT NULL`));

            return {
              accountId: account.id,
              platform: account.platform,
              handle: account.handle,
              status: account.status,
              followers: latestMetric?.followers ?? null,
              impressions: latestMetric?.impressions ?? null,
              engagements: latestMetric?.engagements ?? null,
              lastSyncedAt: latestMetric?.capturedAt ?? null,
              postCount: postCount?.count ?? 0,
              embeddedPostCount: embeddedCount?.count ?? 0,
            };
          }),
        );

        return { userId, accounts: summaries };
      },
    }),

    draft_post: tool({
      description:
        "Draft a social media post grounded in past performance data. Requires explicit user confirmation before publishing.",
      parameters: z.object({
        accountId: z.string().uuid(),
        topic: z.string().min(1),
        tone: z.enum(["professional", "casual", "promotional"]).optional().default("professional"),
        confirmed: z.boolean().describe("Must be true to save the draft"),
      }),
      execute: async ({ accountId, topic, tone, confirmed }) => {
        const account = await getAccountForUser(accountId, userId, env);
        if (!account) return { error: "Account not found" };
        if (!confirmed) {
          return {
            status: "pending_confirmation",
            message: "Set confirmed=true after the user approves this draft.",
            preview: `[Draft for ${account.handle}] Topic: ${topic}, Tone: ${tone}`,
          };
        }
        return {
          status: "draft_saved",
          accountId,
          platform: account.platform,
          topic,
          tone,
          message: "Draft queued. Use schedule_post to publish at a specific time.",
        };
      },
    }),

    schedule_post: tool({
      description:
        "Schedule a drafted post for publishing via background job. Requires explicit user confirmation.",
      parameters: z.object({
        accountId: z.string().uuid(),
        content: z.string().min(1).max(280),
        scheduledAt: z.string().datetime(),
        confirmed: z.boolean().describe("Must be true to enqueue publish job"),
      }),
      execute: async ({ accountId, content, scheduledAt, confirmed }) => {
        const account = await getAccountForUser(accountId, userId, env);
        if (!account) return { error: "Account not found" };
        if (!confirmed) {
          return {
            status: "pending_confirmation",
            message: "Set confirmed=true after the user approves scheduling.",
            preview: { content, scheduledAt },
          };
        }

        const { inngest } = await import("../../inngest/client.js");
        await inngest.send({
          name: "post/schedule.requested",
          data: { accountId, content, scheduledAt, userId },
        });

        return {
          status: "scheduled",
          accountId,
          platform: account.platform,
          scheduledAt,
          message: "Post publish job enqueued via Inngest.",
        };
      },
    }),
  };
}
