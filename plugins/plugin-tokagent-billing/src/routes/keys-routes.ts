/**
 * API key routes — v2.0.0 thin-client forwarders.
 *
 *   POST   /v1/keys        — mint API key (requires Bearer JWT)
 *   GET    /v1/keys        — list keys for the JWT-resolved wallet
 *   DELETE /v1/keys/:id    — revoke a key
 *
 * The plugin never sees plaintext keys (the gateway returns them once on POST).
 */

import type {
  Route,
  RouteRequest,
  RouteResponse,
  IAgentRuntime,
} from '@tokagentos/core';
import { getBillingState } from '../state.js';
import { ensureEnabled, forward, pickForward } from '../lib/forward.js';

async function handleMintKey(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  const headers = pickForward(req);
  const body = (req.body as { name?: string } | undefined) ?? {};
  await forward(res, () => gateway.keysCreate(headers, body));
}

async function handleListKeys(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  await forward(res, () => gateway.keysList(pickForward(req)));
}

async function handleRevokeKey(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  const id = req.params?.['id'];
  if (!id) {
    res.status(400).json({ error: 'Missing key ID in path.' });
    return;
  }
  await forward(res, () => gateway.keysDelete(pickForward(req), id));
}

export const keysRoutes: Route[] = [
  {
    type: 'POST',
    path: '/v1/keys',
    rawPath: true,
    name: 'billing-keys-mint',
    handler: handleMintKey,
  },
  {
    type: 'GET',
    path: '/v1/keys',
    rawPath: true,
    name: 'billing-keys-list',
    handler: handleListKeys,
  },
  {
    type: 'DELETE',
    path: '/v1/keys/:id',
    rawPath: true,
    name: 'billing-keys-revoke',
    handler: handleRevokeKey,
  },
];
