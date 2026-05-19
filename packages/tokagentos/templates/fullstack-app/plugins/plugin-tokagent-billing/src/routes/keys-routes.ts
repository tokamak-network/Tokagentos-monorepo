/**
 * API key management routes (Phase 6).
 *
 *   POST   /v1/keys        — mint a new API key for the authenticated wallet.
 *   GET    /v1/keys        — list all API keys for the authenticated wallet.
 *   DELETE /v1/keys/:id    — revoke an API key by ID.
 *
 * All routes require a valid billing identity (x-api-key or Bearer JWT).
 * Uses `rawPath: true` so routes mount at exact paths (Decision Z32).
 *
 * Returns 503 when billing is disabled (BILLING_ENABLED=false).
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@elizaos/core";
import type { IncomingMessage } from "node:http";
import {
  mintApiKey,
  listApiKeys,
  revokeApiKey,
} from "@tokagentos/billing";
import {
  getBillingState,
  getServerBillingState,
  isBillingStateInitialized,
} from "../state.js";
import { resolveBillingIdentity } from "../middleware/api-key-resolve.js";
import { pickForward, forward, ensureClientReady } from "../lib/forward.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function billingUnavailable(res: RouteResponse): void {
  res.status(503).json({ error: "Billing service unavailable." });
}

/**
 * Extract the raw IncomingMessage from a RouteRequest.
 *
 * The elizaOS RouteRequest wraps the underlying Node HTTP IncomingMessage.
 * Headers are available on `req.headers`; we construct a minimal adapter
 * that satisfies `resolveBillingIdentity`'s `IncomingMessage` signature.
 */
function toIncomingMessage(req: RouteRequest): IncomingMessage {
  // The adapter produces a duck-typed IncomingMessage for header extraction.
  return {
    headers: req.headers ?? {},
    socket: { remoteAddress: undefined },
  } as unknown as IncomingMessage;
}

// ---------------------------------------------------------------------------
// POST /v1/keys — mint
// ---------------------------------------------------------------------------

async function handleMintKey(
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

  const body = req.body as Record<string, unknown> | undefined;
  const name = typeof body?.["name"] === "string" ? body["name"].trim() : "";
  if (!name) {
    res.status(400).json({ error: "Missing required field: name" });
    return;
  }
  if (name.length > 64) {
    res.status(400).json({ error: "name must be 64 characters or fewer" });
    return;
  }

  const minted = await mintApiKey(db, {
    wallet: identity.wallet,
    name,
    authSecret: config.authSecret!,
  });

  res.status(201).json({
    id: minted.id,
    key: minted.plaintext,
    // Disclosure rule for callers — the plaintext `key` is shown ONCE and
    // is not retrievable afterward. Clients must dispatch on this field
    // (e.g. surface a "copy now" prompt) rather than assume future fetch.
    keyDisclosure: "shown_once_store_immediately",
    name,
    createdAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// GET /v1/keys — list
// ---------------------------------------------------------------------------

async function handleListKeys(
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

  const keys = await listApiKeys(db, identity.wallet);
  res.status(200).json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    })),
  });
}

// ---------------------------------------------------------------------------
// DELETE /v1/keys/:id — revoke
// ---------------------------------------------------------------------------

async function handleRevokeKey(
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

  const keyId = req.params?.["id"];
  if (!keyId) {
    res.status(400).json({ error: "Missing key ID in path." });
    return;
  }

  try {
    await revokeApiKey(db, keyId, identity.wallet);
    res.status(200).json({ revoked: true, id: keyId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "revoke failed";
    if (message.includes("not found")) {
      res.status(404).json({ error: message });
    } else if (message.includes("does not belong")) {
      res.status(403).json({ error: "Forbidden." });
    } else {
      res.status(500).json({ error: message });
    }
  }
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const keysRoutes: Route[] = [
  {
    type: "POST",
    path: "/v1/keys",
    rawPath: true,
    public: true,
    name: "billing-keys-mint",
    handler: handleMintKey,
  },
  {
    type: "GET",
    path: "/v1/keys",
    rawPath: true,
    public: true,
    name: "billing-keys-list",
    handler: handleListKeys,
  },
  {
    type: "DELETE",
    path: "/v1/keys/:id",
    rawPath: true,
    public: true,
    name: "billing-keys-revoke",
    handler: handleRevokeKey,
  },
];

// ---------------------------------------------------------------------------
// Client-mode forwarders
// ---------------------------------------------------------------------------

function clientKeysRoutes(): Route[] {
  return [
    {
      type: "POST",
      path: "/v1/keys",
      rawPath: true,
      public: true,
      name: "billing-keys-mint",
      handler: async (req, res) => {
        if (!ensureClientReady(res)) return;
        const body = (req.body ?? {}) as { name?: string };
        await forward(res, () =>
          getBillingState().gateway!.keys.create(pickForward(req), body),
        );
      },
    },
    {
      type: "GET",
      path: "/v1/keys",
      rawPath: true,
      public: true,
      name: "billing-keys-list",
      handler: async (req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () =>
          getBillingState().gateway!.keys.list(pickForward(req)),
        );
      },
    },
    {
      type: "DELETE",
      path: "/v1/keys/:id",
      rawPath: true,
      public: true,
      name: "billing-keys-revoke",
      handler: async (req, res) => {
        if (!ensureClientReady(res)) return;
        const id =
          typeof req.params?.["id"] === "string" ? req.params["id"] : "";
        await forward(res, () =>
          getBillingState().gateway!.keys.delete(pickForward(req), id),
        );
      },
    },
  ];
}

export function getKeysRoutes(mode: "server" | "client"): Route[] {
  return mode === "client" ? clientKeysRoutes() : keysRoutes;
}
