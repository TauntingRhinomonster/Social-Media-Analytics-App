import type { Env } from "../env.js";
import type {
  NormalizedAccountMetrics,
  NormalizedPost,
  PlatformAdapter,
} from "./types.js";

const AUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth";
const TOKEN_URL = "https://graph.facebook.com/v21.0/oauth/access_token";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export function createInstagramAdapter(env: Env): PlatformAdapter {
  const clientId = env.INSTAGRAM_CLIENT_ID;
  const clientSecret = env.INSTAGRAM_CLIENT_SECRET;
  const redirectUri = env.INSTAGRAM_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Instagram OAuth credentials are not configured");
  }

  const scopes = ["instagram_basic", "instagram_manage_insights", "pages_show_list"];

  async function exchangeToken(params: Record<string, string>) {
    const response = await fetch(
      `${TOKEN_URL}?${new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        ...params,
      })}`,
    );

    if (!response.ok) {
      throw new Error(`Instagram token request failed: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in?: number;
    };

    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      scopes,
    };
  }

  return {
    id: "instagram",

    getAuthorizationUrl(state: string) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes.join(","),
        response_type: "code",
        state,
      });
      return `${AUTH_URL}?${params}`;
    },

    async exchangeCode(code: string) {
      const tokens = await exchangeToken({
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      });

      const pagesResponse = await fetch(
        `${GRAPH_BASE}/me/accounts?access_token=${tokens.accessToken}`,
      );

      if (!pagesResponse.ok) {
        throw new Error(`Instagram pages fetch failed: ${await pagesResponse.text()}`);
      }

      const pages = (await pagesResponse.json()) as {
        data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }>;
      };

      const page = pages.data?.find((p) => p.instagram_business_account);
      if (!page?.instagram_business_account) {
        throw new Error("No Instagram Business account linked to Facebook pages");
      }

      const igAccountId = page.instagram_business_account.id;
      const igResponse = await fetch(
        `${GRAPH_BASE}/${igAccountId}?fields=username&access_token=${page.access_token}`,
      );

      if (!igResponse.ok) {
        throw new Error(`Instagram account lookup failed: ${await igResponse.text()}`);
      }

      const igData = (await igResponse.json()) as { id: string; username: string };

      return {
        accessToken: page.access_token,
        expiresAt: tokens.expiresAt,
        scopes,
        platformAccountId: igData.id,
        handle: `@${igData.username}`,
      };
    },

    async refreshTokens(_refreshToken: string) {
      throw new Error("Instagram uses long-lived page tokens; re-authenticate to refresh");
    },

    async fetchAccountMetrics(accessToken: string): Promise<NormalizedAccountMetrics> {
      const accountsResponse = await fetch(`${GRAPH_BASE}/me/accounts?access_token=${accessToken}`);
      if (!accountsResponse.ok) {
        throw new Error(`Instagram pages fetch failed: ${await accountsResponse.text()}`);
      }

      const pages = (await accountsResponse.json()) as {
        data?: Array<{ instagram_business_account?: { id: string }; access_token: string }>;
      };

      const page = pages.data?.find((p) => p.instagram_business_account);
      if (!page?.instagram_business_account) {
        return {};
      }

      const igId = page.instagram_business_account.id;
      const response = await fetch(
        `${GRAPH_BASE}/${igId}?fields=followers_count,media_count&access_token=${page.access_token}`,
      );

      if (!response.ok) {
        throw new Error(`Instagram metrics fetch failed: ${await response.text()}`);
      }

      const data = (await response.json()) as { followers_count?: number; media_count?: number };
      return {
        followers: data.followers_count,
        engagements: data.media_count,
        raw: data as unknown as Record<string, unknown>,
      };
    },

    async fetchRecentPosts(accessToken: string, limit = 25): Promise<NormalizedPost[]> {
      const accountsResponse = await fetch(`${GRAPH_BASE}/me/accounts?access_token=${accessToken}`);
      if (!accountsResponse.ok) return [];

      const pages = (await accountsResponse.json()) as {
        data?: Array<{ instagram_business_account?: { id: string }; access_token: string }>;
      };

      const page = pages.data?.find((p) => p.instagram_business_account);
      if (!page?.instagram_business_account) return [];

      const igId = page.instagram_business_account.id;
      const response = await fetch(
        `${GRAPH_BASE}/${igId}/media?fields=id,caption,timestamp,like_count,comments_count&limit=${limit}&access_token=${page.access_token}`,
      );

      if (!response.ok) return [];

      const data = (await response.json()) as {
        data?: Array<{
          id: string;
          caption?: string;
          timestamp: string;
          like_count?: number;
          comments_count?: number;
        }>;
      };

      return (data.data ?? []).map((media) => ({
        platformPostId: media.id,
        content: media.caption,
        postedAt: new Date(media.timestamp),
        likes: media.like_count ?? 0,
        comments: media.comments_count ?? 0,
        shares: 0,
        raw: media as unknown as Record<string, unknown>,
      }));
    },
  };
}
