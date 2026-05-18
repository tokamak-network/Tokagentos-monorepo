/**
 * Top-up routes — v2.0.0 thin-client forwarders.
 *
 * The gateway holds the operator key, signs depositX402, persists quotes,
 * verifies EIP-3009. The CLI just relays the bytes.
 *
 * Endpoints (see MIGRATION_PLAN.md §3 #12–18):
 *   GET  /v1/topup/info
 *   POST /v1/topup/quote
 *   POST /v1/topup/settle    — relays X-PAYMENT header AND body bytes
 *   POST /v1/topup/preauth
 *   GET  /v1/topup/status
 *   POST /v1/topup/revoke
 *   GET  /v1/quote/:id
 */

import type {
  Route,
  RouteRequest,
  RouteResponse,
  IAgentRuntime,
} from '@tokagentos/core';
import { getBillingState } from '../state.js';
import { ensureEnabled, forward, pickForward } from '../lib/forward.js';

async function handleTopupInfo(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.topupInfo(pickForward(req)));
}

async function handleTopupQuote(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.topupQuote(pickForward(req), req.body));
}

async function handleTopupSettle(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  // The settle path accepts either a JSON body or the x402 X-PAYMENT header.
  // pickForward already lifts X-PAYMENT into the forwarded headers, so both
  // shapes survive the round-trip unchanged.
  await forward(res, () => gateway.topupSettle(pickForward(req), req.body ?? {}));
}

async function handleTopupPreauth(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.topupPreauth(pickForward(req), req.body ?? {}));
}

async function handleTopupStatus(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.topupStatus(pickForward(req)));
}

async function handleTopupRevoke(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.topupRevoke(pickForward(req), req.body));
}

async function handleGetQuote(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  const id = req.params?.['id'];
  if (!id) {
    res.status(400).json({ error: 'Missing quote ID in path.' });
    return;
  }
  await forward(res, () => gateway.quoteGet(id));
}

/** Test / dispose hook — kept as a no-op for compatibility with v1.x boot path. */
export function resetSettleLimiter(): void {
  // v1.x held a settle-path rate limiter here. Rate limiting is now enforced
  // by the gateway; this function is kept as a no-op so callers do not break.
}

export const topupRoutes: Route[] = [
  {
    type: 'GET',
    path: '/v1/topup/info',
    rawPath: true,
    name: 'billing-topup-info',
    handler: handleTopupInfo,
  },
  {
    type: 'POST',
    path: '/v1/topup/quote',
    rawPath: true,
    name: 'billing-topup-quote',
    handler: handleTopupQuote,
  },
  {
    type: 'POST',
    path: '/v1/topup/settle',
    rawPath: true,
    name: 'billing-topup-settle',
    handler: handleTopupSettle,
  },
  {
    type: 'POST',
    path: '/v1/topup/preauth',
    rawPath: true,
    name: 'billing-topup-preauth',
    handler: handleTopupPreauth,
  },
  {
    type: 'GET',
    path: '/v1/topup/status',
    rawPath: true,
    name: 'billing-topup-status',
    handler: handleTopupStatus,
  },
  {
    type: 'POST',
    path: '/v1/topup/revoke',
    rawPath: true,
    name: 'billing-topup-revoke',
    handler: handleTopupRevoke,
  },
  {
    type: 'GET',
    path: '/v1/quote/:id',
    rawPath: true,
    name: 'billing-quote-debug',
    handler: handleGetQuote,
  },
];
