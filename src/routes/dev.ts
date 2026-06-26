import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import type { Env } from "../env.js";
import { getDb } from "../db/index.js";
import { agentRuns, metricSnapshots, oauthAccounts, posts } from "../db/schema.js";
import { ingestAccount } from "../services/ingest.js";
import { backfillAllEmbeddings } from "../ai/embeddings.js";
import { getOrCreateDefaultUser } from "../services/accounts.js";
import { inngest } from "../inngest/client.js";

export function createDevRoutes(env: Env) {
  const app = new Hono();

  app.post("/dev/ingest/:accountId", async (c) => {
    const accountId = c.req.param("accountId");
    try {
      const result = await ingestAccount(accountId, env);
      return c.json(result);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400,
      );
    }
  });

  app.post("/dev/embeddings/backfill", async (c) => {
    const count = await backfillAllEmbeddings(env);
    return c.json({ embeddingsGenerated: count });
  });

  app.post("/dev/ingest/trigger/:accountId", async (c) => {
    const accountId = c.req.param("accountId");
    await inngest.send({ name: "account/ingest.requested", data: { accountId } });
    return c.json({ message: "Ingest event sent", accountId });
  });

  app.get("/dev/accounts/:accountId/status", async (c) => {
    const accountId = c.req.param("accountId");
    const db = getDb(env.DATABASE_URL);
    const account = await db.query.oauthAccounts.findFirst({
      where: eq(oauthAccounts.id, accountId),
    });
    if (!account) return c.json({ error: "Not found" }, 404);

    const [metricCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metricSnapshots)
      .where(eq(metricSnapshots.accountId, accountId));

    const [postCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(eq(posts.accountId, accountId));

    const [embeddedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(sql`${posts.accountId} = ${accountId} AND embedding IS NOT NULL`);

    return c.json({
      account: {
        id: account.id,
        platform: account.platform,
        handle: account.handle,
        status: account.status,
      },
      metricSnapshotCount: metricCount?.count ?? 0,
      postCount: postCount?.count ?? 0,
      embeddedPostCount: embeddedCount?.count ?? 0,
    });
  });

  return app;
}

export function createHistoryRoutes(env: Env) {
  const app = new Hono();

  app.get("/agent/runs", async (c) => {
    const user = await getOrCreateDefaultUser(env);
    const db = getDb(env.DATABASE_URL);
    const runs = await db.query.agentRuns.findMany({
      where: eq(agentRuns.userId, user.id),
      orderBy: desc(agentRuns.createdAt),
      limit: 50,
    });
    return c.json({ runs });
  });

  return app;
}
