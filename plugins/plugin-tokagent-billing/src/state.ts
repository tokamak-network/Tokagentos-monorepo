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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BillingPluginState {
  pool: Pool;
  db: BillingDatabase;
  clients: BillingClients;
  config: BillingConfig;
  /**
   * TwapCache instance from TwapRefreshService, set once the service starts.
   * The billing gate reads this for the current TON/USD price.
   * Optional: may be null if TwapRefreshService hasn't started yet.
   */
  twapCache?: TwapCache;
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
    await pool.end();
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
