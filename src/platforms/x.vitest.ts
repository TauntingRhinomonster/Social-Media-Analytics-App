import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createXAdapter } from "./x.js";
import type { Env } from "../env.js";

const mockEnv = {
  X_CLIENT_ID: "test-client-id",
  X_CLIENT_SECRET: "test-client-secret",
  X_REDIRECT_URI: "https://example.com/callback",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
} as unknown as Env;

describe("createXAdapter", () => {
  describe("error paths", () => {
    it("throws when X OAuth credentials are missing from env", () => {
      // Arrange
      const incompleteEnv = {} as unknown as Env;

      // Act & Assert
      expect(() => createXAdapter(incompleteEnv)).toThrow(
        "X OAuth credentials are not configured"
      );
    });
  });
});

describe("XAdapter.getAuthorizationUrl", () => {
  describe("happy path", () => {
    it("returns a valid Twitter authorization URL containing state and required OAuth params", () => {
      // Arrange
      const adapter = createXAdapter(mockEnv);
      const state = "random-state-string";

      // Act
      const url = adapter.getAuthorizationUrl(state);

      // Assert
      expect(url).toContain("https://twitter.com/i/oauth2/authorize");
      expect(url).toContain(`state=${state}`);
      expect(url).toContain("response_type=code");
      expect(url).toContain("client_id=test-client-id");
    });

    it("includes all required OAuth 2.0 scopes in the authorization URL", () => {
      // Arrange
      const adapter = createXAdapter(mockEnv);

      // Act
      const url = adapter.getAuthorizationUrl("any-state");

      // Assert
      expect(url).toContain("tweet.read");
      expect(url).toContain("users.read");
      expect(url).toContain("offline.access");
    });
  });
});

describe("XAdapter.fetchAccountMetrics", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("happy path", () => {
    it("normalizes a valid Twitter API response to NormalizedAccountMetrics", async () => {
      // Arrange
      const rawApiResponse = {
        data: {
          public_metrics: {
            followers_count: 1200,
            following_count: 300,
            tweet_count: 850,
            listed_count: 12,
          },
        },
      };
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(rawApiResponse), { status: 200 })
      );
      const adapter = createXAdapter(mockEnv);

      // Act
      const result = await adapter.fetchAccountMetrics("valid-access-token");

      // Assert
      expect(result.followers).toBe(1200);
      expect(result.following).toBe(300);
      expect(result.engagements).toBe(850);
      expect(result.raw).toBeDefined();
    });
  });

  describe("error paths", () => {
    it("throws when the platform returns 401 Unauthorized", async () => {
      // Arrange
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
      );
      const adapter = createXAdapter(mockEnv);

      // Act & Assert
      await expect(
        adapter.fetchAccountMetrics("expired-token")
      ).rejects.toThrow("X metrics fetch failed");
    });

    it("throws when the platform returns 429 Rate Limit Exceeded", async () => {
      // Arrange
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response("Too Many Requests", { status: 429 })
      );
      const adapter = createXAdapter(mockEnv);

      // Act & Assert
      await expect(
        adapter.fetchAccountMetrics("valid-token")
      ).rejects.toThrow();
    });
  });
});

describe("XAdapter.fetchRecentPosts", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("happy path", () => {
    it("maps tweet objects to NormalizedPost shape with all required fields", async () => {
      // Arrange — first call: /users/me, second call: /users/:id/tweets
      const meResponse = { data: { id: "user-123" } };
      const tweetsResponse = {
        data: [
          {
            id: "tweet-1",
            text: "Hello world",
            created_at: "2024-01-15T10:00:00.000Z",
            public_metrics: {
              like_count: 42,
              reply_count: 5,
              retweet_count: 8,
              impression_count: 1500,
            },
          },
        ],
      };
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify(meResponse), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(tweetsResponse), { status: 200 }));
      const adapter = createXAdapter(mockEnv);

      // Act
      const posts = await adapter.fetchRecentPosts("valid-access-token");

      // Assert
      expect(posts).toHaveLength(1);
      expect(posts[0].platformPostId).toBe("tweet-1");
      expect(posts[0].content).toBe("Hello world");
      expect(posts[0].likes).toBe(42);
      expect(posts[0].comments).toBe(5);
      expect(posts[0].shares).toBe(8);
      expect(posts[0].impressions).toBe(1500);
      expect(posts[0].postedAt).toBeInstanceOf(Date);
    });
  });

  describe("edge cases", () => {
    it("returns an empty array when the account has no tweets", async () => {
      // Arrange
      const meResponse = { data: { id: "user-456" } };
      const tweetsResponse = { data: [] }; // empty timeline
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify(meResponse), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(tweetsResponse), { status: 200 }));
      const adapter = createXAdapter(mockEnv);

      // Act
      const posts = await adapter.fetchRecentPosts("valid-access-token");

      // Assert
      expect(posts).toEqual([]);
    });

    it("returns an empty array when the API omits the data key entirely (new account)", async () => {
      // Arrange
      const meResponse = { data: { id: "user-789" } };
      const tweetsResponse = {}; // no "data" key
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify(meResponse), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(tweetsResponse), { status: 200 }));
      const adapter = createXAdapter(mockEnv);

      // Act
      const posts = await adapter.fetchRecentPosts("valid-access-token");

      // Assert
      expect(posts).toEqual([]);
    });
  });

  describe("error paths", () => {
    it("throws when the /users/me lookup fails", async () => {
      // Arrange
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response("Forbidden", { status: 403 })
      );
      const adapter = createXAdapter(mockEnv);

      // Act & Assert
      await expect(
        adapter.fetchRecentPosts("bad-token")
      ).rejects.toThrow("X user lookup failed");
    });

    it("throws when the tweets fetch returns a non-2xx status", async () => {
      // Arrange
      const meResponse = { data: { id: "user-123" } };
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify(meResponse), { status: 200 }))
        .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }));
      const adapter = createXAdapter(mockEnv);

      // Act & Assert
      await expect(
        adapter.fetchRecentPosts("valid-token")
      ).rejects.toThrow("X tweets fetch failed");
    });
  });
});
