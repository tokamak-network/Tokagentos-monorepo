/**
 * Persistence layer for billing setup (Phase 9).
 *
 * Decision Z47: Secrets go to the OS keychain via the existing
 * wallet-os-store machinery; non-secret envs go to config.env via
 * persistConfigEnv (the crash-safe atomic writer in packages/agent).
 *
 * If the keychain is unavailable (headless Linux without secret-service),
 * we fall back to writing all values (including secrets) to config.env with
 * a WARNING comment explaining the limitation.
 *
 * writeBillingConfig() is transactional-feeling: if any step fails, any
 * already-written values are rolled back before re-throwing.
 */

import { logger } from "@tokagentos/core";

const log = logger.child({ src: "billing:setup:writer" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BillingSetupValues {
  databaseUrl: string;
  chainRpcUrl: string;
  chainId: number;
  vaultAddress: string;
  ptonAddress: string;
  /** SENSITIVE — goes to OS keychain or .env fallback */
  operatorPrivateKey: string;
  /** SENSITIVE — goes to OS keychain or .env fallback */
  authSecret: string;
  mainnetRpcUrl?: string;
  fixedTonUsd?: number;
}

// ---------------------------------------------------------------------------
// Keychain kind constants for billing secrets (extend SecureStoreSecretKind)
// ---------------------------------------------------------------------------

// We write to config.env rather than the OS keychain directly because:
// 1. SecureStoreSecretKind is a closed union in platform-secure-store.ts
// 2. config.env is already the canonical escape-hatch for sensitive env vars
//    that the agent runtime reads at startup (see packages/agent/src/api/config-env.ts)
// 3. The file is mode 0600, atomic-write, crash-safe, with .bak recovery
//
// For billing secrets specifically, we add them to config.env prefixed with
// `BILLING_` — the agent runtime reads config.env into process.env at boot,
// and initBillingPlugin() reads them from the runtime settings.

// ---------------------------------------------------------------------------
// Dynamic import of persistConfigEnv (avoids a hard dep from plugin → agent)
// ---------------------------------------------------------------------------

type PersistFn = (key: string, value: string) => Promise<void>;

async function getPersistFn(): Promise<PersistFn> {
  let basePersist: PersistFn;
  try {
    // Loaded lazily to avoid pulling the full agent dependency graph.
    const mod = await import("@tokagentos/agent/api/config-env");
    basePersist = mod.persistConfigEnv as PersistFn;
  } catch {
    // Fallback: write directly to ~/.tokagent/config.env using the same
    // file format (key=value, one per line, 0600 mode). NOTE: this path
    // already mirrors to .env + process.env internally — see
    // writeConfigEnvFallback below.
    return async (key: string, value: string): Promise<void> => {
      await writeConfigEnvFallback(key, value);
    };
  }

  // Wrap the agent's persistConfigEnv so we ALSO mirror to .env + process.env.
  // persistConfigEnv writes only to ~/.tokagent/config.env, but the agent
  // runtime reads .env at boot (via dotenv) and populates runtime.getSetting
  // from it. Writing only to config.env means the wizard succeeds but the
  // next runtime boot still reads BILLING_ENABLED=false from .env.
  return async (key: string, value: string): Promise<void> => {
    await basePersist(key, value);
    const dotenvPath = resolveProjectDotenvPath();
    if (dotenvPath) {
      await persistKeyToFile(dotenvPath, key, value, 0o600);
    }
    process.env[key] = value;
  };
}

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";

function resolveConfigEnvPath(): string {
  const stateDir = process.env.TOKAGENT_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".tokagent");
  return path.join(stateDir, "config.env");
}

async function persistKeyToFile(
  filePath: string,
  key: string,
  value: string,
  mode: number,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let existing = "";
  try {
    existing = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  // Remove existing entry for this key (uncommented only — leave comment
  // forms like `# BILLING_FOO=` alone so we don't strip documentation).
  const filtered = lines.filter((line) => {
    const eq = line.indexOf("=");
    if (eq <= 0) return true;
    return line.slice(0, eq).trim() !== key;
  });

  if (value !== "") {
    filtered.push(`${key}=${value}`);
  }

  const content = `${filtered.join("\n")}\n`;
  const tmpPath = `${filePath}.setup.tmp`;
  await fs.writeFile(tmpPath, content, { encoding: "utf8", mode });
  await fs.rename(tmpPath, filePath);
  try { await fs.chmod(filePath, mode); } catch { /* non-fatal */ }
}

/**
 * Resolve the project's `.env` file path. In dev mode the agent process is
 * spawned with cwd set to the scaffolded project root, so `process.cwd()/.env`
 * is the right target. Returns null if no `.env` exists (e.g. production
 * deploys that rely solely on config.env).
 */
function resolveProjectDotenvPath(): string | null {
  try {
    const candidate = path.join(process.cwd(), ".env");
    fsSync.accessSync(candidate);
    return candidate;
  } catch {
    return null;
  }
}

async function writeConfigEnvFallback(key: string, value: string): Promise<void> {
  // Primary store: ~/.tokagent/config.env (0600 — for secrets).
  await persistKeyToFile(resolveConfigEnvPath(), key, value, 0o600);

  // Mirror into the project's .env so the agent's runtime settings (which
  // are populated from the project .env at boot via dotenv loading) see the
  // updated values on the next restart. Without this, the wizard would
  // succeed at writing config.env but the agent would still read the stale
  // BILLING_ENABLED=false from .env on the next boot.
  // Non-secret values can land in .env safely. Secrets (operator key, auth
  // secret) ALSO go here in dev — the assumption is that .env is already
  // gitignored in the scaffold; production deploys should rely on config.env
  // + filesystem permissions instead of .env.
  const dotenvPath = resolveProjectDotenvPath();
  if (dotenvPath) {
    await persistKeyToFile(dotenvPath, key, value, 0o600);
  }

  process.env[key] = value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a complete billing setup to config.env (and optionally the keychain).
 *
 * Steps (in order):
 *  1. Write non-secret envs to config.env
 *  2. Write BILLING_OPERATOR_PRIVATE_KEY to config.env (config.env is 0600)
 *  3. Write BILLING_AUTH_SECRET to config.env
 *  4. Write BILLING_ENABLED=true as the final step
 *
 * If any step fails, already-written values are rolled back (deleted from
 * config.env by writing an empty string).
 *
 * SECURITY NOTE: This function must NEVER log secret values (operatorPrivateKey,
 * authSecret). The log statements use redacted placeholders.
 */
export async function writeBillingConfig(values: BillingSetupValues): Promise<void> {
  const persist = await getPersistFn();

  // Track what we've written so we can roll back on failure.
  const written: string[] = [];

  async function writeOne(key: string, value: string): Promise<void> {
    await persist(key, value);
    written.push(key);
    log.debug({ key }, "billing config key written");
  }

  async function rollback(): Promise<void> {
    log.warn({ keys: written }, "billing setup failed — rolling back written keys");
    const rollbackPersist = await getPersistFn();
    for (const key of written.reverse()) {
      try {
        await rollbackPersist(key, ""); // empty string = delete
        delete process.env[key];
      } catch (err) {
        log.warn({ key, err }, "rollback failed for key — operator may need to clean config.env manually");
      }
    }
  }

  try {
    // ---- Non-secret envs ----
    await writeOne("BILLING_DATABASE_URL", values.databaseUrl);
    await writeOne("BILLING_CHAIN_RPC_URL", values.chainRpcUrl);
    await writeOne("BILLING_CHAIN_ID", String(values.chainId));
    await writeOne("BILLING_VAULT_ADDRESS", values.vaultAddress);
    await writeOne("BILLING_PTON_ADDRESS", values.ptonAddress);

    if (values.mainnetRpcUrl) {
      await writeOne("BILLING_MAINNET_RPC_URL", values.mainnetRpcUrl);
    }
    if (values.fixedTonUsd !== undefined) {
      await writeOne("BILLING_FIXED_TON_USD", String(values.fixedTonUsd));
    }

    // ---- Secrets (written to config.env — mode 0600, crash-safe) ----
    // SECURITY: DO NOT log the actual values below.
    log.info("writing billing operator key to config.env (0600)");
    await writeOne("BILLING_OPERATOR_PRIVATE_KEY", values.operatorPrivateKey);

    log.info("writing billing auth secret to config.env (0600)");
    await writeOne("BILLING_AUTH_SECRET", values.authSecret);

    // ---- Enable billing as the final step ----
    // This is last so a partial write never leaves billing enabled with
    // incomplete config.
    await writeOne("BILLING_ENABLED", "true");
    log.info("billing config written — BILLING_ENABLED=true");

  } catch (err) {
    await rollback();
    throw err;
  }
}

/**
 * Remove all BILLING_* keys from config.env.
 * Used if the user wants to start the setup over.
 */
export async function clearBillingConfig(): Promise<void> {
  const persist = await getPersistFn();
  const BILLING_KEYS = [
    "BILLING_ENABLED",
    "BILLING_DATABASE_URL",
    "BILLING_CHAIN_RPC_URL",
    "BILLING_CHAIN_ID",
    "BILLING_VAULT_ADDRESS",
    "BILLING_PTON_ADDRESS",
    "BILLING_OPERATOR_PRIVATE_KEY",
    "BILLING_AUTH_SECRET",
    "BILLING_MAINNET_RPC_URL",
    "BILLING_FIXED_TON_USD",
  ];
  for (const key of BILLING_KEYS) {
    try {
      await persist(key, "");
      delete process.env[key];
    } catch { /* best-effort */ }
  }
  log.info("billing config cleared");
}
