export type PlatformId = "x" | "linkedin" | "instagram";

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

export interface NormalizedAccountMetrics {
  followers?: number;
  following?: number;
  impressions?: number;
  engagements?: number;
  profileViews?: number;
  raw?: Record<string, unknown>;
}

export interface NormalizedPost {
  platformPostId: string;
  content?: string;
  mediaUrls?: string[];
  postedAt: Date;
  likes: number;
  comments: number;
  shares: number;
  impressions?: number;
  raw?: Record<string, unknown>;
}

export interface PlatformAccountInfo {
  platformAccountId: string;
  handle: string;
}

export interface PlatformAdapter {
  id: PlatformId;
  getAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokens & PlatformAccountInfo>;
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;
  fetchAccountMetrics(accessToken: string): Promise<NormalizedAccountMetrics>;
  fetchRecentPosts(accessToken: string, limit?: number): Promise<NormalizedPost[]>;
}
