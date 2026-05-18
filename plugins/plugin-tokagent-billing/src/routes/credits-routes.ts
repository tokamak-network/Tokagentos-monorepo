/**
 * Credits routes — v2.0.0 thin-client forwarders.
 *
 *   GET  /v1/credits/me       — current ledger snapshot
 *   POST /v1/credits/refresh  — force-hydrate from chain (new in §3 #11)
 */

import type {
  Route,
  RouteRequest,
  RouteResponse,
  IAgentRuntime,
} from '@tokagentos/core';
import { getBillingState } from '../state.js';
import { ensureEnabled, forward, pickForward } from '../lib/forward.js';

async function handleGetCreditsMe(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.creditsMe(pickForward(req)));
}

async function handleRefreshCredits(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.creditsRefresh(pickForward(req)));
}

export const creditsRoutes: Route[] = [
  {
    type: 'GET',
    path: '/v1/credits/me',
    rawPath: true,
    name: 'billing-credits-me',
    handler: handleGetCreditsMe,
  },
  {
    type: 'POST',
    path: '/v1/credits/refresh',
    rawPath: true,
    name: 'billing-credits-refresh',
    handler: handleRefreshCredits,
  },
];
