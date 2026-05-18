/**
 * Auth routes — v2.0.0 thin-client forwarders.
 *
 * Routes mounted by the plugin call the hosted gateway over HTTPS. The CLI
 * never issues nonces, never verifies signatures, never mints JWTs.
 *
 * Endpoints (see MIGRATION_PLAN.md §3):
 *   GET  /v1/auth/nonce            (P) — gateway-compatible CLI path
 *   POST /v1/auth/nonce            (P)
 *   POST /v1/auth/login            (P)
 *   GET  /v1/billing/status        (P) — always served locally; reflects flag.
 */

import type {
  Route,
  RouteRequest,
  RouteResponse,
  IAgentRuntime,
} from '@tokagentos/core';
import { getBillingState, isBillingStateInitialized } from '../state.js';
import { ensureEnabled, forward, pickQuery } from '../lib/forward.js';

async function handleGetNonce(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  const q = pickQuery(req);
  const wallet = q['wallet'];
  if (!wallet) {
    res.status(400).json({ error: 'Missing required query param: wallet' });
    return;
  }
  const chainIdRaw = q['chainId'];
  const chainId = chainIdRaw ? Number(chainIdRaw) : undefined;
  await forward(res, () => gateway.authNonceGet({ wallet, chainId }));
}

async function handlePostNonce(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  const body = req.body as { wallet?: unknown } | undefined;
  const wallet = body?.wallet;
  if (typeof wallet !== 'string' || !wallet) {
    res.status(400).json({ error: 'Missing required body field: wallet' });
    return;
  }
  await forward(res, () => gateway.authNoncePost({ wallet }));
}

async function handleLogin(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.authLogin(req.body));
}

/**
 * /v1/billing/status — served LOCALLY (does not forward).
 *
 * The dashboard polls this to decide whether to render the Billing sidebar.
 * It MUST return `{enabled: false}` when the plugin hasn't run init (or the
 * flag is off) so it is always safe to call without auth — that contract
 * predates the gateway and the v2.x plugin keeps it.
 */
async function handleBillingStatus(
  _req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) {
    res.status(200).json({ enabled: false });
    return;
  }
  const { config } = getBillingState();
  res.status(200).json({ enabled: config.enabled });
}

export const authRoutes: Route[] = [
  {
    type: 'GET',
    path: '/v1/auth/nonce',
    rawPath: true,
    public: true,
    name: 'billing-auth-nonce',
    handler: handleGetNonce,
  },
  {
    type: 'POST',
    path: '/v1/auth/nonce',
    rawPath: true,
    public: true,
    name: 'billing-auth-nonce-post',
    handler: handlePostNonce,
  },
  {
    type: 'POST',
    path: '/v1/auth/login',
    rawPath: true,
    public: true,
    name: 'billing-auth-login',
    handler: handleLogin,
  },
  {
    type: 'GET',
    path: '/v1/billing/status',
    rawPath: true,
    public: true,
    name: 'billing-status',
    handler: handleBillingStatus,
  },
];
