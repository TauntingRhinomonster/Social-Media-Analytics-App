import type { Env } from "../env.js";
import type {
  NormalizedAccountMetrics,
  NormalizedPost,
  OAuthTokens,
  PlatformAccountInfo,
  PlatformAdapter,
} from "./types.js";

const AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const API_BASE = "https://api.twitter.com/2";

export function createXAdapter(env: Env): PlatformAdapter {
  const clientId = env.X_CLIENT_ID;
  const clientSecret = env.X_CLIENT_SECRET;
  const redirectUri = env.X_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("X OAuth credentials are not configured");
  }

  const scopes = ["tweet.read", "users.read", "offline.access"];

  async function tokenRequest(body: Record<string, string>): Promise<OAuthTokens & Partial<PlatformAccountInfo>> {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams(body),
    });

    if (!response.ok) {
      throw new Error(`X token request failed: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      scopes: data.scope?.split(" ") ?? scopes,
    };
  }

  return {
    id: "x",

    getAuthorizationUrl(state: string) {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes.join(" "),
        state,
        code_challenge: "challenge",
        code_challenge_method: "plain",
      });
      return `${AUTH_URL}?${params}`;
    },

    async exchangeCode(code: string) {
      const tokens = await tokenRequest({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: "challenge",
      });

      const me = await fetch(`${API_BASE}/users/me?user.fields=public_metrics,username`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });

      if (!me.ok) {
        throw new Error(`X user lookup failed: ${await me.text()}`);
      }

      const userData = (await me.json()) as {
        data: { id: string; username: string };
      };

      return {
        ...tokens,
        platformAccountId: userData.data.id,
        handle: `@${userData.data.username}`,
      };
    },

    async refreshTokens(refreshToken: string) {
      return tokenRequest({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
    },

    async fetchAccountMetrics(accessToken: string): Promise<NormalizedAccountMetrics> {
      const response = await fetch(
        `${API_BASE}/users/me?user.fields=public_metrics`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!response.ok) {
        throw new Error(`X metrics fetch failed: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        data: {
          public_metrics: {
            followers_count: number;
            following_count: number;
            tweet_count: number;
            listed_count: number;
          };
        };
      };

      const metrics = data.data.public_metrics;
      return {
        followers: metrics.followers_count,
        following: metrics.following_count,
        engagements: metrics.tweet_count,
        raw: data as unknown as Record<string, unknown>,
      };
    },

    async fetchRecentPosts(accessToken: string, limit = 25): Promise<NormalizedPost[]> {
      const meResponse = await fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!meResponse.ok) {
        throw new Error(`X user lookup failed: ${await meResponse.text()}`);
      }
      const me = (await meResponse.json()) as { data: { id: string } };

      const response = await fetch(
        `${API_BASE}/users/${me.data.id}/tweets?max_results=${Math.min(limit, 100)}&tweet.fields=created_at,public_metrics,text&exclude=retweets,replies`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!response.ok) {
        throw new Error(`X tweets fetch failed: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        data?: Array<{
          id: string;
          text: string;
          created_at: string;
          public_metrics: {
            like_count: number;
            reply_count: number;
            retweet_count: number;
            impression_count?: number;
          };
        }>;
      };

      return (data.data ?? []).map((tweet) => ({
        platformPostId: tweet.id,
        content: tweet.text,
        postedAt: new Date(tweet.created_at),
        likes: tweet.public_metrics.like_count,
        comments: tweet.public_metrics.reply_count,
        shares: tweet.public_metrics.retweet_count,
        impressions: tweet.public_metrics.impression_count,
        raw: tweet as unknown as Record<string, unknown>,
      }));
    },
  };
}
