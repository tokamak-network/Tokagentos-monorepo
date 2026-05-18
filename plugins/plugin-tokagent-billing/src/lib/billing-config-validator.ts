/**
 * Dry-run validation helpers for the billing setup action (Phase 9).
 *
 * Each function accepts user-supplied values and returns a ValidationResult
 * with a human-readable error when the value is invalid. No side effects —
 * safe to call before any persistence step.
 *
 * Decision Z47: secrets (operatorPrivateKey, authSecret) are validated here
 * and then persisted to the OS keychain / .env.local via billing-config-writer.ts.
 */

import { createPublicClient, http, isHex, isAddress, getAddress } from "viem";
import type { Address } from "viem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  /** Present when ok=false. Human-readable sentence for display in the panel. */
  error?: string;
  /** Optional extra data (e.g. derived address). */
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/**
 * Validate a Postgres connection string by opening a real connection and
 * running `SELECT 1`.
 *
 * Note: we import pg dynamically so the validator is tree-shaken when pg
 * is unavailable (e.g. browser tests).
 */
export async function validateDatabaseUrl(url: string): Promise<ValidationResult> {
  if (!url || !url.trim()) {
    return { ok: false, error: "Database URL is required." };
  }

  // Basic format check before attempting a real connection.
  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://") && !url.startsWith("pglite://")) {
    return {
      ok: false,
      error: 'Database URL must start with "postgres://", "postgresql://", or "pglite://".',
    };
  }

  // PGlite is an in-process database — no network connection to test.
  if (url.startsWith("pglite://")) {
    return { ok: true };
  }

  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 8_000, max: 1 });
    try {
      await pool.query("SELECT 1");
      return { ok: true };
    } finally {
      await pool.end();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Cannot connect to database: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Chain RPC
// ---------------------------------------------------------------------------

/**
 * Validate an EVM RPC URL by calling eth_chainId.
 * If `expectedChainId` is provided, asserts the returned id matches.
 */
export async function validateChainRpcUrl(
  url: string,
  expectedChainId?: number,
): Promise<ValidationResult & { chainId?: number }> {
  if (!url || !url.trim()) {
    return { ok: false, error: "RPC URL is required." };
  }

  try {
    new URL(url); // throws if malformed
  } catch {
    return { ok: false, error: `Invalid URL format: ${url}` };
  }

  try {
    const client = createPublicClient({ transport: http(url, { timeout: 8_000 }) });
    const chainId = await client.getChainId();

    if (expectedChainId !== undefined && chainId !== expectedChainId) {
      return {
        ok: false,
        error: `RPC returned chain ID ${chainId}, but expected ${expectedChainId}.`,
        data: { chainId },
      };
    }
    return { ok: true, data: { chainId }, chainId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `RPC call failed: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Vault + PTON addresses
// ---------------------------------------------------------------------------

/**
 * Minimal ABI to read vault.pton() — verifies the deployed contract is a
 * real ClaudeVault pointing at the given PTON address.
 */
const VAULT_PTON_ABI = [
  {
    inputs: [],
    name: "pton",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function validateVaultAddress(args: {
  rpcUrl: string;
  vaultAddress: string;
  ptonAddress: string;
}): Promise<ValidationResult> {
  const { rpcUrl, vaultAddress, ptonAddress } = args;

  if (!isAddress(vaultAddress)) {
    return { ok: false, error: `Vault address is not a valid EVM address: ${vaultAddress}` };
  }
  if (!isAddress(ptonAddress)) {
    return { ok: false, error: `PTON address is not a valid EVM address: ${ptonAddress}` };
  }

  try {
    const client = createPublicClient({ transport: http(rpcUrl, { timeout: 8_000 }) });
    const vaultPton = await client.readContract({
      address: vaultAddress as Address,
      abi: VAULT_PTON_ABI,
      functionName: "pton",
    });
    const normalizedVaultPton = getAddress(vaultPton as string);
    const normalizedExpected = getAddress(ptonAddress);
    if (normalizedVaultPton.toLowerCase() !== normalizedExpected.toLowerCase()) {
      return {
        ok: false,
        error: `Vault.pton() returned ${normalizedVaultPton}, expected ${normalizedExpected}. Wrong vault or wrong PTON address.`,
      };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "ContractFunctionExecutionError" typically means no code at address.
    if (msg.includes("ContractFunctionExecutionError") || msg.includes("no code")) {
      return {
        ok: false,
        error: `No contract at vault address ${vaultAddress} on the given chain.`,
      };
    }
    return { ok: false, error: `Vault validation failed: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Operator private key
// ---------------------------------------------------------------------------

/** Regex: 0x-prefixed 32-byte hex (64 hex chars). */
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

export function validateOperatorPrivateKey(key: string): ValidationResult & { address?: string } {
  if (!key || !key.trim()) {
    return { ok: false, error: "Operator private key is required." };
  }

  if (!PRIVATE_KEY_RE.test(key)) {
    return {
      ok: false,
      error: "Private key must be a 0x-prefixed 32-byte hex string (66 characters total).",
    };
  }

  // Derive the Ethereum address to show the user.
  try {
    const { privateKeyToAddress } = require("viem/accounts");
    const address: string = privateKeyToAddress(key as `0x${string}`);
    return { ok: true, address, data: { address } };
  } catch {
    // privateKeyToAddress can throw for degenerate keys (all-zeros, etc.)
    return { ok: false, error: "Private key is not a valid secp256k1 key." };
  }
}

// ---------------------------------------------------------------------------
// Auth secret
// ---------------------------------------------------------------------------

/** Auth secret must be at least 32 characters (provides ~128 bits of entropy at random). */
export function validateAuthSecret(secret: string): ValidationResult {
  if (!secret || !secret.trim()) {
    return { ok: false, error: "Auth secret is required." };
  }
  if (secret.length < 32) {
    return {
      ok: false,
      error: `Auth secret is too short (${secret.length} chars). Use at least 32 characters.`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Generate helpers (used by the panel)
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random 32-byte hex private key.
 * Uses `crypto.getRandomValues` (browser + Node ≥15).
 */
export function generatePrivateKey(): `0x${string}` {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback
    const { randomBytes } = require("node:crypto");
    const buf: Buffer = randomBytes(32);
    buf.copy(Buffer.from(bytes.buffer));
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

/**
 * Generate a cryptographically random auth secret (48 URL-safe base64 chars).
 */
export function generateAuthSecret(): string {
  const bytes = new Uint8Array(36);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    const { randomBytes } = require("node:crypto");
    const buf: Buffer = randomBytes(36);
    buf.copy(Buffer.from(bytes.buffer));
  }
  return Buffer.from(bytes).toString("base64url");
}
