import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { Env } from "../env.js";
import { getDb } from "../db/index.js";
import { agentRuns } from "../db/schema.js";
import { createTools } from "./tools/index.js";

const SYSTEM_PROMPT = `You are Signal, a social media analytics agent. You help users understand their audience growth, find high-performing content, and search past posts semantically.

Use the available tools to fetch real data before answering. Always scope queries to the user's connected accounts.
When comparing performance, cite specific numbers and time periods.
For write actions (draft_post, schedule_post), always ask for explicit confirmation before setting confirmed=true.`;

export async function runAgent(userId: string, prompt: string, env: Env) {
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const tools = createTools(userId, env);

  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_PROMPT,
    prompt,
    tools,
    maxSteps: 8,
  });

  const steps = result.steps.map((step) => ({
    text: step.text,
    toolCalls: step.toolCalls?.map((tc) => ({
      toolName: tc.toolName,
      args: tc.args,
    })),
    toolResults: step.toolResults?.map((tr) => ({
      toolName: tr.toolName,
      result: tr.result,
    })),
  }));

  const db = getDb(env.DATABASE_URL);
  await db.insert(agentRuns).values({
    userId,
    prompt,
    steps,
  });

  return {
    text: result.text,
    steps,
    toolCalls: result.toolCalls,
  };
}
