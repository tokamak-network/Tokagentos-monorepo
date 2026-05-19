/**
 * Usage / stats routes (Phase 6b).
 *
 *   GET /v1/usage/summary   — aggregated tokens + cost over a time window.
 *   GET /v1/usage/calls     — paginated list of recent calls.
 *   GET /v1/usage/keys      — per-API-key aggregated usage.
 *   GET /v1/stats           — operator aggregate counts (unauthenticated debug).
 *
 * Ported from llm-api-gateway/proxy/src/server.ts:747-820.
 * Queries run directly on `billing_call_log` via Drizzle — no separate
 * usageRecorder module is needed since Phase 4 landed the schema.
 *
 * Uses `rawPath: true` so routes mount at the exact paths (Decision Z32).
 * Returns 503 when billing is disabled.
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@elizaos/core";
import type { IncomingMessage } from "node:http";
import type { Address } from "viem";
import { and, eq, gte, lte, lt, sum, count, sql } from "drizzle-orm";
import { callLog, creditState, apiKeys } from "@tokagentos/billing";
import {
  getBillingState,
  getServerBillingState,
  isBillingStateInitialized,
} from "../state.js";
import { resolveBillingIdentity } from "../middleware/api-key-resolve.js";
import {
  pickForward,
  pickQuery,
  forward,
  ensureClientReady,
} from "../lib/forward.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function billingUnavailable(res: RouteResponse): void {
  res.status(503).json({ error: "Billing service unavailable." });
}

function toIncomingMessage(req: RouteRequest): IncomingMessage {
  return {
    headers: req.headers ?? {},
    socket: { remoteAddress: undefined },
  } as unknown as IncomingMessage;
}

/**
 * Parse optional `since` / `until` ISO-8601 query params.
 * Defaults: since = 30 days ago, until = now.
 * Returns { sinceDate, untilDate } or an error string.
 */
function parseTimeWindow(
  req: RouteRequest,
): { sinceDate: Date; untilDate: Date } | { error: string } {
  const sinceQ = req.query?.["since"];
  const untilQ = req.query?.["until"];

  const now = new Date();
  const defaultSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let sinceDate: Date;
  let untilDate: Date;

  if (sinceQ) {
    const d = new Date(sinceQ as string);
    if (isNaN(d.getTime())) return { error: "since must be a valid ISO-8601 date string." };
    sinceDate = d;
  } else {
    sinceDate = defaultSince;
  }

  if (untilQ) {
    const d = new Date(untilQ as string);
    if (isNaN(d.getTime())) return { error: "until must be a valid ISO-8601 date string." };
    untilDate = d;
  } else {
    untilDate = now;
  }

  if (untilDate <= sinceDate) {
    return { error: "until must be after since." };
  }

  return { sinceDate, untilDate };
}

// ---------------------------------------------------------------------------
// GET /v1/usage/summary
// ---------------------------------------------------------------------------

/**
 * Return aggregated token counts and costs for the caller over a time window.
 *
 * Query params:
 *   - `since`  — ISO-8601 start (default: 30 days ago).
 *   - `until`  — ISO-8601 end (default: now).
 *
 * Response 200:
 * ```json
 * {
 *   "wallet": "0x...",
 *   "window": { "since": "...", "until": "..." },
 *   "totalInputTokens": 12345,
 *   "totalOutputTokens": 6789,
 *   "totalCostUsd": "0.05000000",
 *   "totalCostPton": "1000000000000000",
 *   "callCount": 42
 * }
 * ```
 */
async function handleUsageSummary(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config } = getServerBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  if (!identity) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const window = parseTimeWindow(req);
  if ("error" in window) {
    res.status(400).json({ error: window.error });
    return;
  }

  const { sinceDate, untilDate } = window;
  const walletKey = (identity.wallet as string).toLowerCase();

  // Aggregate query on billing_call_log.
  const rows = await db
    .select({
      totalInputTokens: sum(callLog.inputTokens),
      totalOutputTokens: sum(callLog.outputTokens),
      totalCostUsd: sum(callLog.costUsd),
      totalCostPton: sum(callLog.costPton),
      callCount: count(),
    })
    .from(callLog)
    .where(
      and(
        eq(callLog.wallet, walletKey),
        gte(callLog.ts, sinceDate),
        lt(callLog.ts, untilDate),
      ),
    );

  const row = rows[0];

  res.status(200).json({
    wallet: identity.wallet,
    window: { since: sinceDate.toISOString(), until: untilDate.toISOString() },
    totalInputTokens: Number(row?.totalInputTokens ?? 0),
    totalOutputTokens: Number(row?.totalOutputTokens ?? 0),
    totalCostUsd: row?.totalCostUsd ?? "0.00000000",
    totalCostPton: row?.totalCostPton?.toString() ?? "0",
    callCount: Number(row?.callCount ?? 0),
  });
}

// ---------------------------------------------------------------------------
// GET /v1/usage/calls
// ---------------------------------------------------------------------------

/**
 * Return a paginated list of recent calls for the caller.
 *
 * Query params:
 *   - `since`  — ISO-8601 start (default: 30 days ago).
 *   - `until`  — ISO-8601 end (default: now).
 *   - `limit`  — max results (default: 50, max: 200).
 *
 * Response 200:
 * ```json
 * {
 *   "wallet": "0x...",
 *   "calls": [ { "id": "...", "ts": "...", "model": "...", ... } ],
 *   "hasMore": false
 * }
 * ```
 */
async function handleUsageCalls(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config } = getServerBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  if (!identity) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const window = parseTimeWindow(req);
  if ("error" in window) {
    res.status(400).json({ error: window.error });
    return;
  }

  const rawLimit = req.query?.["limit"];
  let limit = 50;
  if (rawLimit !== undefined) {
    const parsed = parseInt(rawLimit as string, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ error: "limit must be a positive integer." });
      return;
    }
    limit = Math.min(parsed, 200);
  }

  const { sinceDate, untilDate } = window;
  const walletKey = (identity.wallet as string).toLowerCase();

  // Fetch limit+1 rows to determine hasMore.
  const rows = await db
    .select()
    .from(callLog)
    .where(
      and(
        eq(callLog.wallet, walletKey),
        gte(callLog.ts, sinceDate),
        lt(callLog.ts, untilDate),
      ),
    )
    .orderBy(sql`${callLog.ts} DESC`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  res.status(200).json({
    wallet: identity.wallet,
    calls: page.map((r) => ({
      id: r.id,
      ts: r.ts.toISOString(),
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cacheInputTokens: r.cacheInputTokens,
      cacheCreationTokens: r.cacheCreationTokens,
      costUsd: r.costUsd,
      costPton: r.costPton.toString(),
      status: r.status,
      apiKeyId: r.apiKeyId ?? null,
    })),
    hasMore,
  });
}

// ---------------------------------------------------------------------------
// GET /v1/usage/keys
// ---------------------------------------------------------------------------

/**
 * Return per-API-key aggregated usage for the caller.
 *
 * Query params:
 *   - `since`  — ISO-8601 start (default: 30 days ago).
 *   - `until`  — ISO-8601 end (default: now).
 *
 * Response 200:
 * ```json
 * {
 *   "wallet": "0x...",
 *   "window": { "since": "...", "until": "..." },
 *   "items": [ { "apiKeyId": "...", "name": "...", "callCount": 5, ... } ]
 * }
 * ```
 */
async function handleUsageKeys(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config } = getServerBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  if (!identity) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const window = parseTimeWindow(req);
  if ("error" in window) {
    res.status(400).json({ error: window.error });
    return;
  }

  const { sinceDate, untilDate } = window;
  const walletKey = (identity.wallet as string).toLowerCase();

  // Group usage by api_key_id.
  const usageRows = await db
    .select({
      apiKeyId: callLog.apiKeyId,
      callCount: count(),
      totalInputTokens: sum(callLog.inputTokens),
      totalOutputTokens: sum(callLog.outputTokens),
      totalCostUsd: sum(callLog.costUsd),
      totalCostPton: sum(callLog.costPton),
    })
    .from(callLog)
    .where(
      and(
        eq(callLog.wallet, walletKey),
        gte(callLog.ts, sinceDate),
        lt(callLog.ts, untilDate),
      ),
    )
    .groupBy(callLog.apiKeyId);

  // Fetch key metadata for names / created / revoked.
  const keyRows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.wallet, walletKey));

  const keyMeta = new Map(keyRows.map((k) => [k.id, k]));

  res.status(200).json({
    wallet: identity.wallet,
    window: { since: sinceDate.toISOString(), until: untilDate.toISOString() },
    items: usageRows.map((r) => {
      const meta = r.apiKeyId ? keyMeta.get(r.apiKeyId) : null;
      return {
        apiKeyId: r.apiKeyId ?? null,
        name: meta?.name ?? null,
        createdAt: meta?.createdAt ? meta.createdAt.toISOString() : null,
        revokedAt: meta?.revokedAt ? meta.revokedAt.toISOString() : null,
        callCount: Number(r.callCount ?? 0),
        totalInputTokens: Number(r.totalInputTokens ?? 0),
        totalOutputTokens: Number(r.totalOutputTokens ?? 0),
        totalCostUsd: r.totalCostUsd ?? "0.00000000",
        totalCostPton: r.totalCostPton?.toString() ?? "0",
      };
    }),
  });
}

// ---------------------------------------------------------------------------
// GET /v1/stats (operator aggregate debug endpoint)
// ---------------------------------------------------------------------------

/**
 * Debug endpoint returning aggregate counts across all wallets.
 * No authentication required — data is non-sensitive aggregate counts.
 *
 * Response 200:
 * ```json
 * {
 *   "totalWallets": 42,
 *   "totalAccruedPton": "...",
 *   "totalBalancePton": "...",
 *   "totalCallLog": 1234
 * }
 * ```
 */
async function handleStats(
  _req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config } = getServerBillingState();
  if (!config.enabled) return billingUnavailable(res);

  // Total wallets with any credits.
  const walletRows = await db
    .select({ count: count() })
    .from(creditState);

  // Aggregate accrued + balance across all wallets.
  const aggRows = await db
    .select({
      totalAccrued: sum(creditState.accrued),
      totalBalance: sum(creditState.balance),
    })
    .from(creditState);

  // Total call log entries.
  const callRows = await db
    .select({ count: count() })
    .from(callLog);

  const agg = aggRows[0];

  res.status(200).json({
    totalWallets: Number(walletRows[0]?.count ?? 0),
    totalAccruedPton: agg?.totalAccrued?.toString() ?? "0",
    totalBalancePton: agg?.totalBalance?.toString() ?? "0",
    totalCallLog: Number(callRows[0]?.count ?? 0),
  });
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const usageRoutes: Route[] = [
  {
    type: "GET",
    path: "/v1/usage/summary",
    rawPath: true,
    name: "billing-usage-summary",
    handler: handleUsageSummary,
  },
  {
    type: "GET",
    path: "/v1/usage/calls",
    rawPath: true,
    name: "billing-usage-calls",
    handler: handleUsageCalls,
  },
  {
    type: "GET",
    path: "/v1/usage/keys",
    rawPath: true,
    name: "billing-usage-keys",
    handler: handleUsageKeys,
  },
  {
    type: "GET",
    path: "/v1/stats",
    rawPath: true,
    public: true,
    name: "billing-stats",
    handler: handleStats,
  },
];

// ---------------------------------------------------------------------------
// Client-mode forwarders
// ---------------------------------------------------------------------------

function clientUsageRoutes(): Route[] {
  return [
    {
      type: "GET",
      path: "/v1/usage/summary",
      rawPath: true,
      name: "billing-usage-summary",
      handler: async (req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () =>
          getBillingState().gateway!.usage.summary(
            pickForward(req),
            pickQuery(req),
          ),
        );
      },
    },
    {
      type: "GET",
      path: "/v1/usage/calls",
      rawPath: true,
      name: "billing-usage-calls",
      handler: async (req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () =>
          getBillingState().gateway!.usage.calls(
            pickForward(req),
            pickQuery(req),
          ),
        );
      },
    },
    {
      type: "GET",
      path: "/v1/usage/keys",
      rawPath: true,
      name: "billing-usage-keys",
      handler: async (req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () =>
          getBillingState().gateway!.usage.keys(
            pickForward(req),
            pickQuery(req),
          ),
        );
      },
    },
    {
      type: "GET",
      path: "/v1/stats",
      rawPath: true,
      public: true,
      name: "billing-stats",
      handler: async (_req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () => getBillingState().gateway!.usage.stats());
      },
    },
  ];
}

export function getUsageRoutes(mode: "server" | "client"): Route[] {
  return mode === "client" ? clientUsageRoutes() : usageRoutes;
}
