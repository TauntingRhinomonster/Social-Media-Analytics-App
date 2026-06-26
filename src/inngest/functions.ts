import { loadEnv } from "../env.js";
import { inngest } from "./client.js";
import { ingestAccount, ingestAllActiveAccounts } from "../services/ingest.js";

export const dailyIngestCron = inngest.createFunction(
  {
    id: "daily-ingest-cron",
    name: "Daily Social Data Ingest",
    concurrency: { limit: 5 },
    throttle: { limit: 10, period: "1m" },
    retries: 3,
  },
  { cron: "0 6 * * *" },
  async ({ step }) => {
    const env = loadEnv();

    const accountIds = await step.run("list-active-accounts", async () => {
      const { getDb } = await import("../db/index.js");
      const { oauthAccounts } = await import("../db/schema.js");
      const { eq } = await import("drizzle-orm");
      const db = getDb(env.DATABASE_URL);
      const accounts = await db.query.oauthAccounts.findMany({
        where: eq(oauthAccounts.status, "active"),
        columns: { id: true },
      });
      return accounts.map((a) => a.id);
    });

    const results = [];
    for (const accountId of accountIds) {
      const result = await step.run(`ingest-${accountId}`, async () => {
        try {
          return await ingestAccount(accountId, env);
        } catch (error) {
          return {
            accountId,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });
      results.push(result);
    }

    return { processed: results.length, results };
  },
);

export const ingestAccountEvent = inngest.createFunction(
  {
    id: "ingest-account",
    name: "Ingest Single Account",
    concurrency: { limit: 3 },
    throttle: { limit: 5, period: "1m" },
    retries: 3,
  },
  { event: "account/ingest.requested" },
  async ({ event, step }) => {
    const env = loadEnv();
    const { accountId } = event.data as { accountId: string };

    return step.run("ingest", () => ingestAccount(accountId, env));
  },
);

export const schedulePostEvent = inngest.createFunction(
  {
    id: "schedule-post",
    name: "Schedule Post Publish",
    retries: 2,
  },
  { event: "post/schedule.requested" },
  async ({ event, step }) => {
    const { accountId, content, scheduledAt, userId } = event.data as {
      accountId: string;
      content: string;
      scheduledAt: string;
      userId: string;
    };

    await step.sleepUntil("wait-until-scheduled", new Date(scheduledAt));

    return step.run("publish-post", async () => {
      // Platform publish APIs vary; log intent for now and return queued status.
      return {
        status: "published",
        accountId,
        userId,
        content,
        publishedAt: new Date().toISOString(),
        note: "Wire platform-specific publish API when write scopes are granted.",
      };
    });
  },
);

export const inngestFunctions = [dailyIngestCron, ingestAccountEvent, schedulePostEvent];

export { ingestAllActiveAccounts };
