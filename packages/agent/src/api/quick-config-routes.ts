/**
 * Quick-config route — minimal "paste a private key + RPC URLs, restart"
 * surface used by the simplified Settings page.
 *
 * Writes go through `persistConfigEnv()` (atomic, .bak snapshot, key
 * validation, hijack-vector blocklist). Restart is delegated to the
 * existing `restartRuntime` / `scheduleRuntimeRestart` plumbing the
 * wallet routes already use.
 */
import type http from "node:http";

import { persistConfigEnv } from "./config-env.js";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers.js";

// Supported chains. Each maps to the canonical env key the runtime reads.
// `ethereum` writes to TOKAGENT_RPC_URL which the agent auto-mirrors to
// EVM_PROVIDER_URL / ETHEREUM_PROVIDER_MAINNET / EVM_PROVIDER_MAINNET at
// boot. Other chains write to their per-chain key directly.
const CHAIN_TO_ENV_KEY = {
  ethereum: "TOKAGENT_RPC_URL",
  polygon: "POLYGON_RPC_URL",
  base: "ETHEREUM_PROVIDER_BASE",
  arbitrum: "ETHEREUM_PROVIDER_ARBITRUM",
  optimism: "ETHEREUM_PROVIDER_OPTIMISM",
  bsc: "BSC_RPC_URL",
} as const;

export type QuickConfigChain = keyof typeof CHAIN_TO_ENV_KEY;
const SUPPORTED_CHAINS = Object.keys(CHAIN_TO_ENV_KEY) as QuickConfigChain[];

export interface QuickConfigRpcEntry {
  chain: QuickConfigChain;
  url: string;
}

export interface QuickConfigRequestBody {
  privateKey: string;
  rpcs: QuickConfigRpcEntry[];
}

export interface QuickConfigRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "readJsonBody" | "json" | "error"> {
  restartRuntime?: (reason: string) => Promise<boolean>;
  scheduleRuntimeRestart?: (reason: string) => void;
}

// 0x-prefixed, exactly 64 hex chars.
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function isValidPrivateKey(value: unknown): value is string {
  return typeof value === "string" && PRIVATE_KEY_PATTERN.test(value);
}

function isValidRpcUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isQuickConfigChain(value: unknown): value is QuickConfigChain {
  return (
    typeof value === "string" &&
    (SUPPORTED_CHAINS as readonly string[]).includes(value)
  );
}

/**
 * POST /api/config/quick-setup
 *
 * Body shape:
 *   {
 *     "privateKey": "0x...",                    // 64 hex chars
 *     "rpcs": [
 *       { "chain": "ethereum", "url": "https://..." },
 *       { "chain": "polygon",  "url": "https://..." }
 *     ]
 *   }
 *
 * Response:
 *   { ok: true, written: string[], restarting: boolean }
 *
 * Both fields are required. Rpcs may be empty (skip RPC writes, just rotate
 * the private key). Duplicate chains in `rpcs` → 400. Last write per chain
 * wins is not allowed — we want the caller to send a clean dedup'd list.
 */
export async function handleQuickConfigRoutes(
  ctx: QuickConfigRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, readJsonBody, json, error } = ctx;

  if (method !== "POST" || pathname !== "/api/config/quick-setup") {
    return false;
  }

  const body = await readJsonBody<Partial<QuickConfigRequestBody>>(req, res);
  if (!body) return true; // readJsonBody already responded with 400.

  if (!isValidPrivateKey(body.privateKey)) {
    error(res, "privateKey must be a 0x-prefixed 64-character hex string", 400);
    return true;
  }

  if (!Array.isArray(body.rpcs)) {
    error(res, "rpcs must be an array (use [] to skip RPC writes)", 400);
    return true;
  }

  const seenChains = new Set<QuickConfigChain>();
  for (const entry of body.rpcs) {
    if (!entry || typeof entry !== "object") {
      error(res, "each rpcs entry must be an object { chain, url }", 400);
      return true;
    }
    if (!isQuickConfigChain(entry.chain)) {
      error(
        res,
        `unsupported chain "${String(entry.chain)}" — supported: ${SUPPORTED_CHAINS.join(", ")}`,
        400,
      );
      return true;
    }
    if (seenChains.has(entry.chain)) {
      error(
        res,
        `duplicate chain "${entry.chain}" — send one URL per chain`,
        400,
      );
      return true;
    }
    seenChains.add(entry.chain);
    if (!isValidRpcUrl(entry.url)) {
      error(
        res,
        `rpcs[${entry.chain}].url must be a non-empty http(s) URL`,
        400,
      );
      return true;
    }
  }

  // All input validated — start writing.
  const written: string[] = [];

  try {
    await persistConfigEnv("TOKAGENT_PRIVATE_KEY", body.privateKey);
    written.push("TOKAGENT_PRIVATE_KEY");

    for (const entry of body.rpcs) {
      const envKey = CHAIN_TO_ENV_KEY[entry.chain];
      await persistConfigEnv(envKey, entry.url);
      written.push(envKey);
    }
  } catch (err) {
    error(res, `failed to persist config: ${String(err)}`, 500);
    return true;
  }

  // Trigger restart. Prefer the in-process restart if available; otherwise
  // schedule one so the next user-triggered restart picks up the new env.
  const restarting = ctx.restartRuntime
    ? await ctx.restartRuntime("quick-config-updated").catch(() => false)
    : false;
  if (!restarting) {
    ctx.scheduleRuntimeRestart?.("quick-config-updated");
  }

  json(res, { ok: true, written, restarting });
  return true;
}

export { SUPPORTED_CHAINS as QUICK_CONFIG_CHAINS };
