/**
 * Plugin-internal singleton for the shared billing database + config state.
 *
 * Decision Z28: elizaOS `Service.start(runtime)` provides no constructor-
 * dependency injection. To share `db`, `clients`, and `config` across all
 * four services + middleware + routes without per-service pool construction,
 * we use a module-level mutable singleton that is populated by `Plugin.init`
 * (via `initBillingPlugin`) and consumed by services/routes/middleware via
 * `getBillingState()`.
 *
 * This is a deliberate, scoped singleton. Phase 8 may revisit if needed;
 * the alternative (passing state through IAgentRuntime settings as serialized
 * strings) loses type safety.
 *
 * Lifecycle:
 *   - `setBillingState(state)` — called once in Plugin.init
 *   - `getBillingState()`      — called at request/tick time (never at import)
 *   - `clearBillingState()`    — called in Plugin.dispose; ends pg pool
 */

import type { Pool } from "pg";
import type {
  BillingDatabase,
  BillingClients,
  BillingConfig,
  TwapCache,
} from "@tokagentos/billing";
import type { GatewayProxy } from "./lib/gateway-proxy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BillingPluginState {
  /**
   * Postgres pool. Only populated in server-mode (config.billingMode='server').
   * In client-mode the plugin owns no database.
   */
  pool?: Pool;
  /**
   * Drizzle-wrapped DB handle. Only populated in server-mode.
   */
  db?: BillingDatabase;
  /**
   * Viem chain clients (read + write). Only populated in server-mode.
   */
  clients?: BillingClients;
  config: BillingConfig;
  /**
   * TwapCache instance from TwapRefreshService, set once the service starts.
   * The billing gate reads this for the current TON/USD price.
   * Only populated in server-mode (TwapRefreshService is not registered in
   * client-mode).
   */
  twapCache?: TwapCache;
  /**
   * Typed HTTPS forwarder pointing at the upstream tokagent gateway.
   * Only populated when config.billingMode === 'client'.
   *
   * In client-mode, every plugin route resolves through this object
   * (e.g. `state.gateway.credits.me(headers)`) and returns the upstream
   * response verbatim.
   */
  gateway?: GatewayProxy;
}

// ---------------------------------------------------------------------------
// Singleton storage
// ---------------------------------------------------------------------------

let _state: BillingPluginState | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store the initialized billing state. Must be called exactly once per
 * process lifecycle (by `Plugin.init`). Throws if called a second time
 * without an intervening `clearBillingState()`.
 */
export function setBillingState(state: BillingPluginState): void {
  if (_state) {
    throw new Error(
      "Billing state already initialized; call clearBillingState() first",
    );
  }
  _state = state;
}

/**
 * Retrieve the initialized billing state.
 *
 * Throws a clear error if called before `Plugin.init` has run — this guards
 * against accidental early access at module load time (all consumers must
 * call this at request/tick time, never at top-level import).
 */
export function getBillingState(): BillingPluginState {
  if (!_state) {
    throw new Error(
      "Billing state not initialized — did Plugin.init run? " +
        "Ensure the tokagent-billing plugin is loaded and BILLING_ENABLED=true.",
    );
  }
  return _state;
}

/**
 * Clear the billing state and close the pg Pool. Called by Plugin.dispose.
 *
 * Safe to call when state is already null (no-op).
 */
export async function clearBillingState(): Promise<void> {
  if (_state) {
    const pool = _state.pool;
    _state = null;
    // pool is only present in server-mode; client-mode never creates one.
    if (pool) {
      await pool.end();
    }
  }
}

/**
 * Attach the TwapCache from TwapRefreshService to the shared state.
 * Called by TwapRefreshService.start() after the service initializes.
 * Safe to call multiple times (last write wins — only one TwapRefreshService
 * runs per process).
 */
export function registerTwapCache(cache: TwapCache): void {
  if (_state) {
    _state.twapCache = cache;
  }
}

/**
 * Test-only: check whether state is currently initialized.
 * Do not use in production code.
 */
export function isBillingStateInitialized(): boolean {
  return _state !== null;
}

// ---------------------------------------------------------------------------
// Mode-specific narrowed state helpers
// ---------------------------------------------------------------------------

/**
 * Server-mode shape of the billing state — `pool`, `db`, and `clients`
 * are guaranteed non-null. Use this in route handlers that only run in
 * server-mode (the mode check is enforced by `getServerBillingState()`).
 */
export interface ServerBillingState
  extends Omit<BillingPluginState, "pool" | "db" | "clients" | "gateway"> {
  pool: NonNullable<BillingPluginState["pool"]>;
  db: NonNullable<BillingPluginState["db"]>;
  clients: NonNullable<BillingPluginState["clients"]>;
  /** Always undefined in server-mode. */
  gateway?: undefined;
}

/**
 * Get the billing state narrowed to server-mode. Throws when called in
 * client-mode or before init. The cast is safe because server-mode
 * `initBillingPlugin` populates pool/db/clients before `setBillingState`.
 *
 * Existing server-mode route handlers call this in place of
 * `getBillingState()` to get a non-null `db`/`clients`/`pool` without
 * scattering non-null assertions.
 */
export function getServerBillingState(): ServerBillingState {
  const s = getBillingState();
  // Treat undefined billingMode (e.g. legacy test fixtures that omit the
  // field) as server-mode for backwards compatibility. Only 'client' is
  // rejected.
  if (s.config.billingMode === "client") {
    throw new Error(
      "getServerBillingState() called in client-mode. " +
        "Use getBillingState().gateway in client-mode.",
    );
  }
  if (!s.db || !s.pool || !s.clients) {
    throw new Error(
      "Server-mode billing state missing pool/db/clients — initBillingPlugin did not run",
    );
  }
  return s as ServerBillingState;
}
