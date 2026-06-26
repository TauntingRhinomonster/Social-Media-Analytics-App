import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(connectionString: string) {
  if (!db) {
    client = postgres(connectionString, { max: 10 });
    db = drizzle(client, { schema });
  }
  return db;
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}

export async function ensureExtensions(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  } finally {
    await sql.end();
  }
}

export { schema };
