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

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";
import type { IncomingMessage } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  mintApiKey,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
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

  // `?hard=true` hard-deletes the row instead of soft-revoking. Soft revoke
  // sets `revoked_at` and leaves the row in `billing_api_keys` for audit
  // trail — useful but accumulates rows over time. Hard delete reclaims the
  // row entirely; the historical `billing_call_log` rows still reference
  // `api_key_id` as a plain text column (no FK), so call-log history is not
  // affected. The default remains soft-revoke for backward compatibility.
  const hardFlag = req.query?.["hard"];
  const hardDelete =
    hardFlag === "true" || hardFlag === "1" || hardFlag === "";

  try {
    if (hardDelete) {
      await deleteApiKey(db, keyId, identity.wallet);
      res.status(200).json({ deleted: true, id: keyId });
    } else {
      await revokeApiKey(db, keyId, identity.wallet);
      res.status(200).json({ revoked: true, id: keyId });
    }
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
// POST /v1/keys/install — write BILLING_CHAT_KEY to project .env + restart
// ---------------------------------------------------------------------------
//
// LOCAL ONLY. This endpoint runs on the user's local agent (whether it's
// configured as billing client or billing server) and:
//   1. Validates the request body has a syntactically valid `sk-ai-*` key
//   2. Atomically upserts `BILLING_CHAT_KEY=<key>` into `<cwd>/.env`
//      (preserving all other entries; existing commented `# BILLING_CHAT_KEY`
//      lines are replaced in place rather than duplicated)
//   3. Mirrors the new value into process.env immediately so in-flight
//      chat calls pick it up without waiting for the restart
//   4. Schedules `process.exit(75)` after a short delay — exit code 75 is
//      the contract with `packages/app-core/scripts/run-node.mjs`, which
//      catches it, rebuilds if needed, and respawns. If the user runs the
//      agent without that supervisor, the process simply exits and the
//      user must relaunch manually.
//
// AUTH: requires the same authenticated identity as the rest of /v1/keys/*
// (SIWE session OR existing API key). Format-validates `sk-ai-...` but does
// not verify the key was minted by this user — anyone with shell access to
// the user's machine could already edit .env directly, so the auth check
// is meant to guard against trivial CSRF, not a malicious LAN attacker.
const SK_AI_KEY_RE = /^sk-ai-[A-Za-z0-9_-]{16,128}$/;

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Atomically upsert `KEY=VALUE` in a project-root .env file.
 *
 * - If the key already exists on a line (commented or not), replace that
 *   line with the new uncommented `KEY=VALUE`.
 * - Otherwise append `KEY=VALUE` to the end (with one preceding blank line
 *   if the file ends with non-empty content).
 *
 * Atomicity: write to `<filePath>.tmp` then rename. The rename is atomic
 * on POSIX. We do NOT keep a `.bak` for the project .env because users
 * version-control their .env templates separately and the .env itself is
 * gitignored — a `.bak` would just be visual noise.
 *
 * Values are written verbatim (no quoting). sk-ai-* keys are URL-safe
 * base64 (`/^sk-ai-[A-Za-z0-9_-]+$/`) so they never need quoting; callers
 * MUST validate before invoking this function.
 */
async function upsertDotenvLine(
  filePath: string,
  key: string,
  value: string,
): Promise<void> {
  const existing = (await readIfExists(filePath)) ?? "";
  const lines = existing.length === 0 ? [] : existing.split(/\r?\n/);
  // dotenv-style split leaves a trailing empty element for files ending in
  // newline. Strip it so we can manage trailing newlines explicitly.
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const re = new RegExp(`^\\s*#?\\s*${key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s*=`);
  let updatedAt = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (re.test(lines[i] ?? "")) {
      lines[i] = `${key}=${value}`;
      updatedAt = i;
      break;
    }
  }
  if (updatedAt < 0) {
    if (lines.length > 0 && (lines[lines.length - 1] ?? "").trim() !== "") {
      lines.push("");
    }
    lines.push(`${key}=${value}`);
  }
  const nextContents = `${lines.join("\n")}\n`;
  const tmp = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fs.open(tmp, "w", 0o600);
  try {
    await handle.writeFile(nextContents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, filePath);
}

const RESTART_EXIT_CODE = 75;

async function handleInstallKey(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  // Auth check. In client-mode, `resolveBillingIdentity` returns null (no
  // local DB / authSecret) — but the local user is the one running the
  // server, and we serve this from localhost only, so we accept the request
  // unconditionally in client-mode as long as the body is well-formed.
  // In server-mode, require a valid identity.
  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  const billingState = getBillingState();
  const isClientMode = billingState.config.billingMode === "client";
  if (!identity && !isClientMode) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const key = typeof body?.["key"] === "string" ? body["key"].trim() : "";
  if (!SK_AI_KEY_RE.test(key)) {
    res.status(400).json({
      error: "Invalid key format — expected sk-ai-... (16+ url-safe chars).",
    });
    return;
  }
  const restart = body?.["restart"] !== false; // default: true

  const envPath = path.join(process.cwd(), ".env");
  try {
    await upsertDotenvLine(envPath, "BILLING_CHAT_KEY", key);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to write .env: ${message}` });
    return;
  }

  // Update in-flight env so subsequent chat calls work even before restart.
  // configureBillingChatMirror() at startup mirrors BILLING_CHAT_KEY → OPENAI_API_KEY,
  // but the OpenAI plugin may cache its key — restart is still the safe path.
  process.env["BILLING_CHAT_KEY"] = key;
  process.env["OPENAI_API_KEY"] = key;

  // Respond first, then exit so the runner can respawn. The dashboard polls
  // for server availability and reloads on reconnect.
  const restartDelayMs = 1500;
  res.status(200).json({
    ok: true,
    envPath,
    restarting: restart,
    restartDelayMs,
    message: restart
      ? "Key saved to .env. Agent restarting…"
      : "Key saved to .env (restart skipped — restart manually to fully apply).",
  });

  if (restart) {
    setTimeout(() => {
      // Use exit code 75 so the supervisor (run-node.mjs) catches it and
      // respawns. Plain exit(0) would terminate the runner too.
      // eslint-disable-next-line n/no-process-exit
      process.exit(RESTART_EXIT_CODE);
    }, restartDelayMs);
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
  // MUST be registered BEFORE the /v1/keys/:id DELETE route in the array
  // (routes are matched in registration order on rawPath: true with
  // params). `install` is a string literal that could otherwise match the
  // `:id` param and route the install POST through revoke handling.
  {
    type: "POST",
    path: "/v1/keys/install",
    rawPath: true,
    public: true,
    name: "billing-keys-install",
    handler: handleInstallKey,
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
    // /v1/keys/install is LOCAL on both modes (writes the local agent's
    // own .env), so it uses the same direct handler as server-mode.
    // Must precede /v1/keys/:id in this array for the same param-matching
    // reason explained on the server-mode array.
    {
      type: "POST",
      path: "/v1/keys/install",
      rawPath: true,
      public: true,
      name: "billing-keys-install",
      handler: handleInstallKey,
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
