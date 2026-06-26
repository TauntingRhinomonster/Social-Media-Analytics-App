import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { runAgent } from "../ai/agent.js";
import { getOrCreateDefaultUser } from "../services/accounts.js";

const runSchema = z.object({
  prompt: z.string().min(1),
});

export function createAgentRoutes(env: Env) {
  const app = new Hono();

  app.post("/agent/run", async (c) => {
    const body = await c.req.json();
    const parsed = runSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const user = await getOrCreateDefaultUser(env);
    const result = await runAgent(user.id, parsed.data.prompt, env);
    return c.json(result);
  });

  return app;
}
