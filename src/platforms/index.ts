import type { Env } from "../env.js";
import type { PlatformAdapter } from "./types.js";
import { createXAdapter } from "./x.js";
import { createLinkedInAdapter } from "./linkedin.js";
import { createInstagramAdapter } from "./instagram.js";

export function getPlatformAdapter(platform: string, env: Env): PlatformAdapter {
  switch (platform) {
    case "x":
      return createXAdapter(env);
    case "linkedin":
      return createLinkedInAdapter(env);
    case "instagram":
      return createInstagramAdapter(env);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export function getAllPlatformAdapters(env: Env): PlatformAdapter[] {
  const adapters: PlatformAdapter[] = [];
  if (env.X_CLIENT_ID && env.X_CLIENT_SECRET) adapters.push(createXAdapter(env));
  if (env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET) {
    adapters.push(createLinkedInAdapter(env));
  }
  if (env.INSTAGRAM_CLIENT_ID && env.INSTAGRAM_CLIENT_SECRET) {
    adapters.push(createInstagramAdapter(env));
  }
  return adapters;
}

export * from "./types.js";
