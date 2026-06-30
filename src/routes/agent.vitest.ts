import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgentRoutes } from "./agent.js";
import * as agentModule from "../ai/agent.js";
import * as accountsModule from "../services/accounts.js";

vi.mock("../ai/agent.js");
vi.mock("../services/accounts.js");

const mockEnv = {} as any;

const mockUser = { id: "user-abc", email: "test@example.com", createdAt: new Date() };

describe("POST /agent/run", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(accountsModule.getOrCreateDefaultUser).mockResolvedValue(mockUser);
  });

  describe("happy path", () => {
    it("returns 200 with text and steps when the agent completes successfully", async () => {
      // Arrange
      vi.mocked(agentModule.runAgent).mockResolvedValue({
        text: "Your top post had 500 likes.",
        steps: [{ type: "tool-call", toolName: "get_top_posts", args: {} } as any],
      });
      const app = createAgentRoutes(mockEnv);
      const req = new Request("http://localhost/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "What are my top posts?" }),
      });

      // Act
      const res = await app.fetch(req);
      const body = await res.json() as any;

      // Assert
      expect(res.status).toBe(200);
      expect(body.text).toBe("Your top post had 500 likes.");
      expect(Array.isArray(body.steps)).toBe(true);
    });

    it("passes the authenticated user ID to the agent", async () => {
      // Arrange
      vi.mocked(agentModule.runAgent).mockResolvedValue({ text: "OK", steps: [] });
      const app = createAgentRoutes(mockEnv);
      const req = new Request("http://localhost/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Summarize my analytics" }),
      });

      // Act
      await app.fetch(req);

      // Assert — runAgent must be called with the correct user ID
      expect(agentModule.runAgent).toHaveBeenCalledWith(
        "user-abc",
        "Summarize my analytics",
        mockEnv
      );
    });
  });

  describe("error paths", () => {
    it("returns 400 when prompt is missing from the request body", async () => {
      // Arrange
      const app = createAgentRoutes(mockEnv);
      const req = new Request("http://localhost/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Act
      const res = await app.fetch(req);

      // Assert
      expect(res.status).toBe(400);
      expect(agentModule.runAgent).not.toHaveBeenCalled();
    });

    it("returns 400 when prompt is an empty string", async () => {
      // Arrange
      const app = createAgentRoutes(mockEnv);
      const req = new Request("http://localhost/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "" }),
      });

      // Act
      const res = await app.fetch(req);

      // Assert
      expect(res.status).toBe(400);
    });

    it("returns 400 when the request body is not valid JSON", async () => {
      // Arrange
      const app = createAgentRoutes(mockEnv);
      const req = new Request("http://localhost/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "this is not json",
      });

      // Act
      const res = await app.fetch(req);

      // Assert
      expect(res.status).toBe(400);
    });

    it("propagates a 500 when runAgent throws an unexpected error", async () => {
      // Arrange
      vi.mocked(agentModule.runAgent).mockRejectedValue(new Error("OpenAI quota exceeded"));
      const app = createAgentRoutes(mockEnv);
      const req = new Request("http://localhost/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Tell me something" }),
      });

      // Act
      const res = await app.fetch(req);

      // Assert
      expect(res.status).toBe(500);
    });
  });
});
