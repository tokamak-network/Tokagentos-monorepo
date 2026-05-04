import type http from "node:http";
import { logger } from "@tokagentos/core";
import type { TokagentConfig } from "../config/config.js";
import { normalizeOnboardingProviderId } from "../contracts/onboarding.js";
import type { ReadJsonBodyOptions } from "./http-helpers.js";
import {
  applyOnboardingConnectionConfig,
  createProviderSwitchConnection,
} from "./provider-switch-config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderSwitchRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  state: { config: TokagentConfig };
  json: (res: http.ServerResponse, data: unknown, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    options?: ReadJsonBodyOptions,
  ) => Promise<T | null>;
  saveTokagentConfig: (config: TokagentConfig) => void;
  scheduleRuntimeRestart: (reason: string) => void;
  providerSwitchInProgress: boolean;
  setProviderSwitchInProgress: (value: boolean) => void;
  restartRuntime?: (reason: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function handleProviderSwitchRoutes(
  ctx: ProviderSwitchRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, state, json, error, readJsonBody } = ctx;

  if (method === "POST" && pathname === "/api/provider/switch") {
    const body = await readJsonBody<{
      provider: string;
      apiKey?: string;
      primaryModel?: string;
    }>(req, res);
    if (!body) return true;
    if (!body.provider || typeof body.provider !== "string") {
      error(res, "Missing provider", 400);
      return true;
    }

    const normalizedProvider = normalizeOnboardingProviderId(body.provider);
    if (!normalizedProvider) {
      error(res, "Invalid provider", 400);
      return true;
    }

    if (ctx.providerSwitchInProgress) {
      error(res, "Provider switch already in progress", 409);
      return true;
    }
    ctx.setProviderSwitchInProgress(true);

    try {
      const trimmedApiKey =
        typeof body.apiKey === "string" ? body.apiKey.trim() : undefined;
      if (trimmedApiKey && trimmedApiKey.length > 512) {
        ctx.setProviderSwitchInProgress(false);
        error(res, "API key is too long", 400);
        return true;
      }

      const config = state.config;
      let connection:
        | ReturnType<typeof createProviderSwitchConnection>
        | {
            kind: "cloud-managed";
            cloudProvider: "tokagentcloud";
            apiKey?: string;
          }
        | null;
      if (normalizedProvider === "tokagentcloud") {
        connection = {
          kind: "cloud-managed" as const,
          cloudProvider: "tokagentcloud" as const,
          apiKey: trimmedApiKey,
        };
        if (trimmedApiKey) {
          const cloudApiKey = trimmedApiKey;
          const cloudBaseUrl = "https://www.tokagentcloud.ai";
          process.env.ANTHROPIC_BASE_URL = `${cloudBaseUrl}/api/v1`;
          process.env.ANTHROPIC_API_KEY = cloudApiKey;
          process.env.OPENAI_BASE_URL = `${cloudBaseUrl}/api/v1`;
          process.env.OPENAI_API_KEY = cloudApiKey;
        }
      } else if (normalizedProvider) {
        connection = createProviderSwitchConnection({
          provider: normalizedProvider,
          apiKey: trimmedApiKey,
          primaryModel:
            typeof body.primaryModel === "string"
              ? body.primaryModel.trim()
              : undefined,
        });
      } else {
        connection = null;
      }

      if (!connection) {
        ctx.setProviderSwitchInProgress(false);
        error(res, "Invalid provider", 400);
        return true;
      }

      if (normalizedProvider === "litellm" && !process.env.LITELLM_BASE_URL?.trim()) {
        ctx.setProviderSwitchInProgress(false);
        json(res, {
          success: false,
          reason: "missing_litellm_base_url",
          message: "Set LITELLM_BASE_URL in .env first",
        }, 400);
        return true;
      }

      await applyOnboardingConnectionConfig(config, connection);
      ctx.saveTokagentConfig(config);

      const restartReason = `provider switch to ${normalizedProvider}`;
      const restarted = ctx.restartRuntime
        ? await ctx.restartRuntime(restartReason)
        : false;
      if (!restarted) {
        ctx.scheduleRuntimeRestart(restartReason);
      }

      ctx.setProviderSwitchInProgress(false);

      json(res, {
        success: true,
        provider: normalizedProvider,
        restarting: restarted,
      });
    } catch (err) {
      ctx.setProviderSwitchInProgress(false);
      logger.error(
        `[api] Provider switch failed: ${err instanceof Error ? err.stack : err}`,
      );
      error(res, "Provider switch failed", 500);
    }
    return true;
  }

  return false;
}
