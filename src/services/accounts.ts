import { eq } from "drizzle-orm";
import type { Env } from "../env.js";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { decryptToken, encryptToken } from "../lib/crypto.js";
import type { OAuthAccount } from "../db/schema.js";
import { oauthAccounts } from "../db/schema.js";
import { getPlatformAdapter } from "../platforms/index.js";

export async function getOrCreateDefaultUser(env: Env) {
  const db = getDb(env.DATABASE_URL);

  if (env.DEFAULT_USER_ID) {
    const existing = await db.query.users.findFirst({
      where: eq(users.id, env.DEFAULT_USER_ID),
    });
    if (existing) return existing;
  }

  const byEmail = await db.query.users.findFirst({
    where: eq(users.email, env.DEFAULT_USER_EMAIL),
  });
  if (byEmail) return byEmail;

  const [created] = await db
    .insert(users)
    .values({ email: env.DEFAULT_USER_EMAIL })
    .returning();
  return created!;
}

export async function getAccessToken(account: OAuthAccount, env: Env): Promise<string> {
  if (
    account.tokenExpiresAt &&
    account.tokenExpiresAt.getTime() <= Date.now() + 60_000 &&
    account.refreshTokenEnc
  ) {
    return refreshAccountToken(account, env);
  }
  return decryptToken(Buffer.from(account.accessTokenEnc), env.TOKEN_ENCRYPTION_KEY);
}

export async function refreshAccountToken(account: OAuthAccount, env: Env): Promise<string> {
  if (!account.refreshTokenEnc) {
    return decryptToken(Buffer.from(account.accessTokenEnc), env.TOKEN_ENCRYPTION_KEY);
  }

  const adapter = getPlatformAdapter(account.platform, env);
  const refreshToken = decryptToken(Buffer.from(account.refreshTokenEnc), env.TOKEN_ENCRYPTION_KEY);
  const tokens = await adapter.refreshTokens(refreshToken);

  const db = getDb(env.DATABASE_URL);
  await db
    .update(oauthAccounts)
    .set({
      accessTokenEnc: encryptToken(tokens.accessToken, env.TOKEN_ENCRYPTION_KEY),
      refreshTokenEnc: tokens.refreshToken
        ? encryptToken(tokens.refreshToken, env.TOKEN_ENCRYPTION_KEY)
        : account.refreshTokenEnc,
      tokenExpiresAt: tokens.expiresAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(oauthAccounts.id, account.id));

  return tokens.accessToken;
}

export async function getAccountForUser(accountId: string, userId: string, env: Env) {
  const db = getDb(env.DATABASE_URL);
  return db.query.oauthAccounts.findFirst({
    where: (table, { and, eq: eqFn }) =>
      and(eqFn(table.id, accountId), eqFn(table.userId, userId)),
  });
}

export async function getUserAccounts(userId: string, env: Env) {
  const db = getDb(env.DATABASE_URL);
  return db.query.oauthAccounts.findMany({
    where: eq(oauthAccounts.userId, userId),
  });
}
