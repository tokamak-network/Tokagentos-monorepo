/**
 * Billing gate middleware (Phase 6).
 *
 * Applied to `/v1/messages*` and `/v1/chat/completions`. Performs the
 * reserve-before-useModel cycle and returns closures for commit + release.
 *
 * Flow:
 *   1. Resolve caller identity (x-api-key or JWT).
 *   2. Detect model from parsed request body; validate against allowlist.
 *   3. Estimate input tokens and compute max cost.
 *   4. Get current TON/USD price from TwapRefreshService cache.
 *   5. Reserve `maxPton` from the wallet's credit balance.
 *   6. Return `{ allow: true, commit, release }` — or an error result.
 *
 * The route handler calls `commit(actualUsd)` after streaming finishes, or
 * `release(outcome)` on abort/error.
 *
 * Ported from llm-api-gateway/proxy/src/handleMessages.ts (reserve portion).
 */

import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import {
  assertSupportedModel,
  normalizeModelId,
  estimateInputTokens,
  estimateMaxCostUsd,
  detectCacheControl,
  usdToPton,
  computeCharge,
  reserve,
  release,
  commit,
  callLog,
  TwapCache,
  type BillingDatabase,
} from "@tokagentos/billing";
import { getBillingState } from "../state.js";
import { resolveBillingIdentity } from "./api-key-resolve.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReleaseOutcome =
  | "released_abort"
  | "released_error"
  | "released_complete";

/**
 * Optional usage parameters forwarded by the route handler when calling
 * `commit`. When provided, the gate writes a `billing_call_log` row alongside
 * the ledger commit (Decision Z38). When omitted, the commit still succeeds
 * but no call-log row is created — useful for tests and edge cases where the
 * route handler cannot observe upstream usage (Decision Z38).
 */
export interface BillingCommitParams {
  /** Provider-reported input tokens. */
  inputTokens?: number;
  /** Provider-reported output tokens. */
  outputTokens?: number;
  /** Provider-reported cache-read tokens, if any. */
  cacheInputTokens?: number;
  /** Provider-reported cache-write (creation) tokens, if any. */
  cacheCreationTokens?: number;
  /** The model identifier that actually served the request. */
  model?: string;
  /** Call status. Defaults to "ok" when commit() is called. */
  status?: "ok" | "error" | "aborted";
}

export interface BillingGateResult {
  allow: boolean;
  /** HTTP status to return when `allow=false`. */
  status: number;
  reason?:
    | "insufficient_balance"
    | "invalid_auth"
    | "rate_limited"
    | "unsupported_model";
  body?: object;
  /**
   * Called by the route handler after the upstream response completes.
   * Commits the actual cost deducted against the reservation. When `params`
   * is provided, also writes a `billing_call_log` row (Decision Z38).
   */
  commit?: (actualUsd: number, params?: BillingCommitParams) => Promise<void>;
  /**
   * Called by the route handler when the upstream call errors or is aborted.
   * Returns the reserved amount to the wallet's spendable balance.
   */
  release?: (outcome: ReleaseOutcome) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse the model identifier from the (pre-parsed) request body. */
function extractModel(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const m = (body as Record<string, unknown>).model;
  return typeof m === "string" ? m : null;
}

/** Extract message array from body (supports both OpenAI and Anthropic shapes). */
function extractMessages(body: unknown): Array<{ role: string; content: unknown }> {
  if (typeof body !== "object" || body === null) return [];
  const msgs = (body as Record<string, unknown>).messages;
  return Array.isArray(msgs) ? (msgs as Array<{ role: string; content: unknown }>) : [];
}

function extractTools(body: unknown): unknown[] | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const t = (body as Record<string, unknown>).tools;
  return Array.isArray(t) ? t : undefined;
}

function extractSystem(body: unknown): unknown | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  return (body as Record<string, unknown>).system;
}

/**
 * Get the `max_tokens` from the request body (conservative estimation cap).
 * Defaults to 4096 when absent (safe upper bound for most models).
 */
function extractMaxOutputTokens(body: unknown): number {
  if (typeof body !== "object" || body === null) return 4096;
  const v = (body as Record<string, unknown>).max_tokens;
  return typeof v === "number" && v > 0 ? v : 4096;
}

/** Read the TwapCache from the running TwapRefreshService, if available. */
function getTwapCache(): TwapCache | null {
  try {
    return getBillingState().twapCache ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply the billing gate to a request.
 *
 * @param req  - Raw Node IncomingMessage (for header extraction).
 * @param body - Pre-parsed JSON body (already read by the server).
 */
export async function applyBillingGate(
  req: IncomingMessage,
  body: unknown,
): Promise<BillingGateResult> {
  const { db, config } = getBillingState();

  // ---- 1. Resolve caller identity ----
  const identity = await resolveBillingIdentity(req);
  if (!identity) {
    return {
      allow: false,
      status: 401,
      reason: "invalid_auth",
      body: {
        type: "billing_error",
        code: "invalid_auth",
        message: "authentication required",
      },
    };
  }
  const wallet = identity.wallet;

  // ---- 2. Detect and validate model ----
  const rawModel = extractModel(body);
  if (!rawModel) {
    return {
      allow: false,
      status: 400,
      reason: "unsupported_model",
      body: {
        type: "billing_error",
        code: "missing_model",
        message: 'request body missing required "model" field',
      },
    };
  }
  let model: string;
  try {
    model = normalizeModelId(rawModel);
    assertSupportedModel(model);
  } catch {
    return {
      allow: false,
      status: 400,
      reason: "unsupported_model",
      body: {
        type: "billing_error",
        code: "unsupported_model",
        message: `model "${rawModel}" not in billing allowlist`,
      },
    };
  }

  // ---- 3. Estimate input tokens and max cost ----
  const messages = extractMessages(body);
  const tools = extractTools(body);
  const system = extractSystem(body);
  const maxOutputTokens = extractMaxOutputTokens(body);
  const cacheInfo = detectCacheControl(body);

  const inputTokens = estimateInputTokens(messages, tools, system);
  const maxCostUsd = estimateMaxCostUsd({
    model,
    inputTokens,
    maxOutputTokens,
    hasCacheControl: cacheInfo.hasCacheControl,
    cacheTtl: cacheInfo.hasCacheControl ? cacheInfo.cacheTtl : undefined,
  });

  // ---- 4. Get TON/USD price ----
  // Prefer the TwapCache from the running TwapRefreshService (already-warmed).
  // Fall back to config.fixedTonUsd (test/dev mode).
  const cachedPrice = getTwapCache()?.get()?.tonUsd;
  const tonUsd = config.fixedTonUsd ?? cachedPrice;
  if (!tonUsd) {
    return {
      allow: false,
      status: 503,
      body: {
        type: "billing_error",
        code: "price_oracle_unavailable",
        message:
          "TON/USD price oracle returned no fresh value and no fixedTonUsd override",
      },
    };
  }

  // ---- 5. Compute max reservation amount ----
  const maxPton = usdToPton(maxCostUsd, tonUsd);
  const requestId = randomUUID();

  // ---- 6. Attempt to reserve ----
  const result = await reserve(db, { wallet, amount: maxPton, requestId });
  if (!result.ok) {
    return {
      allow: false,
      status: 402,
      reason: "insufficient_balance",
      body: {
        type: "billing_error",
        code: "insufficient_balance",
        message: "insufficient billing balance for this request",
        requiredPton: maxPton.toString(),
        availablePton: result.available.toString(),
      },
    };
  }

  const { reservationId } = result;
  const effectiveMarginBps = config.effectiveMarginBps;

  // ---- 7. Build commit closure ----
  // When `params` is provided (route handler observed upstream usage), the
  // commit also writes a `billing_call_log` row. The call log and ledger
  // commit run as separate statements; if the call-log insert fails the
  // ledger commit still applies — we never want to refund a reserved amount
  // because an audit row failed to write. (Decision Z38)
  const commitFn = async (
    actualUsd: number,
    params?: BillingCommitParams,
  ): Promise<void> => {
    const charge = computeCharge({ actualUsd, tonUsd, marginBps: effectiveMarginBps });
    await commit(db, reservationId, charge.totalPton);

    if (params) {
      try {
        await db.insert(callLog).values({
          wallet: wallet.toLowerCase(),
          apiKeyId: identity.apiKeyId ?? null,
          model: params.model ?? model,
          inputTokens: params.inputTokens ?? 0,
          outputTokens: params.outputTokens ?? 0,
          cacheInputTokens: params.cacheInputTokens ?? 0,
          cacheCreationTokens: params.cacheCreationTokens ?? 0,
          costUsd: actualUsd.toFixed(8),
          costPton: charge.totalPton,
          requestId,
          status: params.status ?? "ok",
        });
      } catch (err) {
        // Never block the commit on call-log failure — the reservation is
        // already committed at this point. Caller's logger (when present)
        // will surface the error if needed.
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(
          `[billing-gate] call_log insert failed (reservationId=${reservationId}, wallet=${wallet}): ${message}`,
        );
      }
    }
  };

  // ---- 8. Build release closure ----
  const releaseFn = async (outcome: ReleaseOutcome): Promise<void> => {
    await release(db, reservationId, outcome);
  };

  return {
    allow: true,
    status: 200,
    commit: commitFn,
    release: releaseFn,
  };
}

// ---------------------------------------------------------------------------
// Export helper: paths that require the billing gate
// ---------------------------------------------------------------------------

/** Returns true if the given pathname should be gated through billing. */
export function isBillingGatedPath(pathname: string): boolean {
  return (
    pathname === "/v1/messages" ||
    pathname.startsWith("/v1/messages/") ||
    pathname === "/v1/chat/completions"
  );
}
