import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Env } from "../env.js";
import { getDb } from "../db/index.js";
import { oauthAccounts } from "../db/schema.js";
import { encryptToken } from "../lib/crypto.js";
import { getPlatformAdapter } from "../platforms/index.js";
import { getOrCreateDefaultUser } from "../services/accounts.js";

const oauthStates = new Map<string, { userId: string; platform: string; expiresAt: number }>();

function cleanupStates() {
  const now = Date.now();
  for (const [key, value] of oauthStates) {
    if (value.expiresAt < now) oauthStates.delete(key);
  }
}

export function createOAuthRoutes(env: Env) {
  const app = new Hono();

  app.get("/oauth/:platform/connect", async (c) => {
    cleanupStates();
    const platform = c.req.param("platform");
    const user = await getOrCreateDefaultUser(env);
    const adapter = getPlatformAdapter(platform, env);
    const state = randomBytes(16).toString("hex");
    oauthStates.set(state, {
      userId: user.id,
      platform,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return c.redirect(adapter.getAuthorizationUrl(state));
  });

  app.get("/oauth/:platform/callback", async (c) => {
    const platform = c.req.param("platform");
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      return c.json({ error }, 400);
    }
    if (!code || !state) {
      return c.json({ error: "Missing code or state" }, 400);
    }

    const stored = oauthStates.get(state);
    oauthStates.delete(state);
    if (!stored || stored.platform !== platform || stored.expiresAt < Date.now()) {
      return c.json({ error: "Invalid or expired state" }, 400);
    }

    const adapter = getPlatformAdapter(platform, env);
    const result = await adapter.exchangeCode(code);
    const db = getDb(env.DATABASE_URL);

    const [account] = await db
      .insert(oauthAccounts)
      .values({
        userId: stored.userId,
        platform,
        platformAccountId: result.platformAccountId,
        handle: result.handle,
        accessTokenEnc: encryptToken(result.accessToken, env.TOKEN_ENCRYPTION_KEY),
        refreshTokenEnc: result.refreshToken
          ? encryptToken(result.refreshToken, env.TOKEN_ENCRYPTION_KEY)
          : null,
        tokenExpiresAt: result.expiresAt ?? null,
        scopes: result.scopes,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [oauthAccounts.userId, oauthAccounts.platform, oauthAccounts.platformAccountId],
        set: {
          handle: result.handle,
          accessTokenEnc: encryptToken(result.accessToken, env.TOKEN_ENCRYPTION_KEY),
          refreshTokenEnc: result.refreshToken
            ? encryptToken(result.refreshToken, env.TOKEN_ENCRYPTION_KEY)
            : null,
          tokenExpiresAt: result.expiresAt ?? null,
          scopes: result.scopes,
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning();

    return c.json({
      message: "Account connected",
      account: {
        id: account!.id,
        platform: account!.platform,
        handle: account!.handle,
        status: account!.status,
      },
    });
  });

  return app;
}

export function createAccountsRoutes(env: Env) {
  const app = new Hono();

  app.get("/accounts", async (c) => {
    const user = await getOrCreateDefaultUser(env);
    const db = getDb(env.DATABASE_URL);
    const accounts = await db.query.oauthAccounts.findMany({
      where: eq(oauthAccounts.userId, user.id),
    });

    return c.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        handle: a.handle,
        status: a.status,
        tokenExpiresAt: a.tokenExpiresAt,
        updatedAt: a.updatedAt,
      })),
    });
  });

  return app;
}
