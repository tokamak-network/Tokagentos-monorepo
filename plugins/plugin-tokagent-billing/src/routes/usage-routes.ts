/**
 * Usage / stats routes — v2.0.0 thin-client forwarders.
 *
 *   GET /v1/usage/summary    — aggregated tokens + cost
 *   GET /v1/usage/calls      — paginated call log
 *   GET /v1/usage/keys       — per-API-key usage
 *   GET /v1/stats            — operator aggregate counts (public)
 *
 * No DB queries here — the gateway aggregates and the CLI forwards.
 */

import type {
  Route,
  RouteRequest,
  RouteResponse,
  IAgentRuntime,
} from '@tokagentos/core';
import { getBillingState } from '../state.js';
import { ensureEnabled, forward, pickForward, pickQuery } from '../lib/forward.js';

async function handleUsageSummary(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.usageSummary(pickForward(req), pickQuery(req)));
}

async function handleUsageCalls(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.usageCalls(pickForward(req), pickQuery(req)));
}

async function handleUsageKeys(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.usageKeys(pickForward(req), pickQuery(req)));
}

async function handleStats(
  _req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.stats());
}

export const usageRoutes: Route[] = [
  {
    type: 'GET',
    path: '/v1/usage/summary',
    rawPath: true,
    name: 'billing-usage-summary',
    handler: handleUsageSummary,
  },
  {
    type: 'GET',
    path: '/v1/usage/calls',
    rawPath: true,
    name: 'billing-usage-calls',
    handler: handleUsageCalls,
  },
  {
    type: 'GET',
    path: '/v1/usage/keys',
    rawPath: true,
    name: 'billing-usage-keys',
    handler: handleUsageKeys,
  },
  {
    type: 'GET',
    path: '/v1/stats',
    rawPath: true,
    public: true,
    name: 'billing-stats',
    handler: handleStats,
  },
];
