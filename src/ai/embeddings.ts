import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { eq, isNull } from "drizzle-orm";
import type { Env } from "../env.js";
import { getDb } from "../db/index.js";
import { posts } from "../db/schema.js";
import { EMBEDDING_DIMENSIONS } from "../db/schema.js";

const EMBEDDING_MODEL = "text-embedding-3-small";

function getEmbeddingModel(env: Env) {
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  return openai.embedding(EMBEDDING_MODEL);
}

export async function embedText(text: string, env: Env): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel(env),
    value: text,
  });
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`);
  }
  return embedding;
}

export async function embedPostsWithoutEmbeddings(accountId: string, env: Env): Promise<number> {
  const db = getDb(env.DATABASE_URL);
  const pending = await db.query.posts.findMany({
    where: (table, { and, eq: eqFn, isNull: isNullFn }) =>
      and(eqFn(table.accountId, accountId), isNullFn(table.embedding)),
    limit: 100,
  });

  if (pending.length === 0) return 0;

  const texts = pending.map((p) => p.content ?? "");
  const { embeddings } = await embedMany({
    model: getEmbeddingModel(env),
    values: texts,
  });

  for (let i = 0; i < pending.length; i++) {
    const post = pending[i]!;
    const embedding = embeddings[i]!;
    await db
      .update(posts)
      .set({ embedding })
      .where(eq(posts.id, post.id));
  }

  return pending.length;
}

export async function backfillAllEmbeddings(env: Env): Promise<number> {
  const db = getDb(env.DATABASE_URL);
  const accounts = await db.query.posts.findMany({
    where: isNull(posts.embedding),
    columns: { accountId: true },
  });

  const accountIds = [...new Set(accounts.map((a) => a.accountId))];
  let total = 0;
  for (const accountId of accountIds) {
    total += await embedPostsWithoutEmbeddings(accountId, env);
  }
  return total;
}
