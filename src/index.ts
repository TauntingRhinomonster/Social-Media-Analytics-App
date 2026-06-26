import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve as inngestServe } from "inngest/hono";
import { loadEnv } from "./env.js";
import { ensureExtensions, getDb } from "./db/index.js";
import { createOAuthRoutes, createAccountsRoutes } from "./routes/oauth.js";
import { createAgentRoutes } from "./routes/agent.js";
import { createDevRoutes, createHistoryRoutes } from "./routes/dev.js";
import { inngest } from "./inngest/client.js";
import { inngestFunctions } from "./inngest/functions.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const env = loadEnv();

async function runMigrations() {
  await ensureExtensions(env.DATABASE_URL);
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationPath = join(__dirname, "db/migrations/0000_initial.sql");
  const sql = readFileSync(migrationPath, "utf8");
  const client = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await client.unsafe(sql);
  } finally {
    await client.end();
  }
}

const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({ status: "ok", service: "signal-analytics" }));

app.route("/", createOAuthRoutes(env));
app.route("/", createAccountsRoutes(env));
app.route("/", createAgentRoutes(env));
app.route("/", createDevRoutes(env));
app.route("/", createHistoryRoutes(env));

app.on(
  ["GET", "PUT", "POST"],
  "/api/inngest",
  inngestServe({
    client: inngest,
    functions: inngestFunctions,
  }),
);

async function main() {
  await runMigrations();
  getDb(env.DATABASE_URL);

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.log(`Signal Analytics API running on http://localhost:${info.port}`);
    console.log(`Health: http://localhost:${info.port}/health`);
    console.log(`OAuth connect: http://localhost:${info.port}/oauth/x/connect`);
    console.log(`Agent: POST http://localhost:${info.port}/agent/run`);
    console.log(`Inngest: http://localhost:${info.port}/api/inngest`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
