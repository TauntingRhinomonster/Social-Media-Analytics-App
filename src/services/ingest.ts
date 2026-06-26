import { eq, sql } from "drizzle-orm";
import type { Env } from "../env.js";
import { getDb } from "../db/index.js";
import { oauthAccounts, posts } from "../db/schema.js";
import type { OAuthAccount } from "../db/schema.js";
import { getPlatformAdapter } from "../platforms/index.js";
import { getAccessToken } from "./accounts.js";
import { embedPostsWithoutEmbeddings } from "../ai/embeddings.js";

export async function ingestAccount(accountId: string, env: Env) {
  const db = getDb(env.DATABASE_URL);
  const account = await db.query.oauthAccounts.findFirst({
    where: eq(oauthAccounts.id, accountId),
  });

  if (!account || account.status !== "active") {
    throw new Error(`Account ${accountId} not found or inactive`);
  }

  const accessToken = await getAccessToken(account, env);
  const adapter = getPlatformAdapter(account.platform, env);

  const [metrics, platformPosts] = await Promise.all([
    adapter.fetchAccountMetrics(accessToken),
    adapter.fetchRecentPosts(accessToken),
  ]);

  await db.execute(sql`
    INSERT INTO metric_snapshots (
      account_id, captured_at, followers, following, impressions, engagements, profile_views, raw
    ) VALUES (
      ${account.id}, now(), ${metrics.followers ?? null}, ${metrics.following ?? null},
      ${metrics.impressions ?? null}, ${metrics.engagements ?? null},
      ${metrics.profileViews ?? null}, ${metrics.raw ? JSON.stringify(metrics.raw) : null}::jsonb
    )
    ON CONFLICT (account_id, ((captured_at)::date))
    DO UPDATE SET
      followers = EXCLUDED.followers,
      following = EXCLUDED.following,
      impressions = EXCLUDED.impressions,
      engagements = EXCLUDED.engagements,
      profile_views = EXCLUDED.profile_views,
      raw = EXCLUDED.raw
  `);

  for (const post of platformPosts) {
    await db
      .insert(posts)
      .values({
        accountId: account.id,
        platformPostId: post.platformPostId,
        content: post.content,
        mediaUrls: post.mediaUrls ?? [],
        postedAt: post.postedAt,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        impressions: post.impressions,
        raw: post.raw,
      })
      .onConflictDoUpdate({
        target: [posts.accountId, posts.platformPostId],
        set: {
          content: post.content,
          likes: post.likes,
          comments: post.comments,
          shares: post.shares,
          impressions: post.impressions,
          raw: post.raw,
        },
      });
  }

  const embedded = await embedPostsWithoutEmbeddings(account.id, env);

  return {
    accountId: account.id,
    metricsSaved: true,
    postsUpserted: platformPosts.length,
    embeddingsGenerated: embedded,
  };
}

export async function ingestAllActiveAccounts(env: Env) {
  const db = getDb(env.DATABASE_URL);
  const activeAccounts = await db.query.oauthAccounts.findMany({
    where: eq(oauthAccounts.status, "active"),
  });

  const results: Array<{ accountId: string; ok: boolean; error?: string }> = [];
  for (const account of activeAccounts) {
    try {
      await ingestAccount(account.id, env);
      results.push({ accountId: account.id, ok: true });
    } catch (error) {
      results.push({
        accountId: account.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export type { OAuthAccount };
