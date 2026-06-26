import type { Env } from "../env.js";
import type {
  NormalizedAccountMetrics,
  NormalizedPost,
  PlatformAdapter,
} from "./types.js";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API_BASE = "https://api.linkedin.com/v2";

export function createLinkedInAdapter(env: Env): PlatformAdapter {
  const clientId = env.LINKEDIN_CLIENT_ID;
  const clientSecret = env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("LinkedIn OAuth credentials are not configured");
  }

  const scopes = ["r_organization_social", "r_basicprofile", "w_member_social"];

  async function tokenRequest(body: Record<string, string>) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });

    if (!response.ok) {
      throw new Error(`LinkedIn token request failed: ${await response.text()}`);
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
      scopes: data.scope?.split(",") ?? scopes,
    };
  }

  return {
    id: "linkedin",

    getAuthorizationUrl(state: string) {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes.join(" "),
        state,
      });
      return `${AUTH_URL}?${params}`;
    },

    async exchangeCode(code: string) {
      const tokens = await tokenRequest({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });

      const profileResponse = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });

      if (!profileResponse.ok) {
        throw new Error(`LinkedIn profile fetch failed: ${await profileResponse.text()}`);
      }

      const profile = (await profileResponse.json()) as { id: string; localizedFirstName?: string; localizedLastName?: string };

      return {
        ...tokens,
        platformAccountId: profile.id,
        handle: [profile.localizedFirstName, profile.localizedLastName].filter(Boolean).join(" ") || profile.id,
      };
    },

    async refreshTokens(refreshToken: string) {
      return tokenRequest({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      });
    },

    async fetchAccountMetrics(accessToken: string): Promise<NormalizedAccountMetrics> {
      const response = await fetch(
        `${API_BASE}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(followerCount)))`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!response.ok) {
        return { raw: { note: "LinkedIn org metrics require organization admin scope" } };
      }

      const data = (await response.json()) as {
        elements?: Array<{ "organization~"?: { followerCount?: number } }>;
      };

      const followers = data.elements?.[0]?.["organization~"]?.followerCount;
      return { followers, raw: data as unknown as Record<string, unknown> };
    },

    async fetchRecentPosts(accessToken: string, limit = 25): Promise<NormalizedPost[]> {
      const response = await fetch(
        `${API_BASE}/ugcPosts?q=authors&authors=List(urn:li:person:me)&count=${limit}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as {
        elements?: Array<{
          id: string;
          created: { time: number };
          specificContent?: {
            "com.linkedin.ugc.ShareContent"?: {
              shareCommentary?: { text?: string };
            };
          };
        }>;
      };

      return (data.elements ?? []).map((post) => ({
        platformPostId: post.id,
        content: post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text,
        postedAt: new Date(post.created.time),
        likes: 0,
        comments: 0,
        shares: 0,
        raw: post as unknown as Record<string, unknown>,
      }));
    },
  };
}
