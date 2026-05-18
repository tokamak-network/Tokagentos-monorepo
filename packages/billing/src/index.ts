/**
 * @tokagentos/billing — pure-compute helpers for tokagentos CLIs.
 *
 * v2.0.0: the ledger / auth-issuing / workers / chain-write layers have moved
 * to the hosted gateway (`gateway.tokagent.ai`). This package is now what the
 * CLI keeps locally: token estimation, model pricing, USD↔PTON conversion,
 * the TWAP oracle (read-only), the EIP-3009/EIP-712 typed-data builders so the
 * CLI can help a user pre-sign offline, and the SIWE signature verifier so
 * the CLI can preview an auth handshake without a round-trip.
 *
 * Everything that opens a DB connection or signs a chain write has been
 * removed. See MIGRATION_PLAN.md §5.2 for the surviving surface.
 */

// ---------------------------------------------------------------------------
// Chain — constants, ABIs, typed-data, viem client factory (read-only TWAP).
// ---------------------------------------------------------------------------
export * from './chain/addresses.js';
export * from './chain/abi/pton.js';
export * from './chain/abi/vault.js';
export * from './chain/typed-data.js';
export * from './chain/clients.js';
// EIP-3009 typed-data builder + off-chain verifier (no chain writes).
export * from './chain/pton.js';

// ---------------------------------------------------------------------------
// Pricing — token estimation + per-model rates + provider usage normalization.
// ---------------------------------------------------------------------------
export * from './pricing/rates.js';
export * from './pricing/tokenize.js';
export * from './pricing/usage.js';

// ---------------------------------------------------------------------------
// Charge math — USD ↔ atto-PTON, margin split, cache_control sniff.
// Pure helpers; safe to call from the CLI's local /v1/estimate route.
// ---------------------------------------------------------------------------
export * from './billing/charge.js';

// ---------------------------------------------------------------------------
// TWAP — composite oracle + cache. CLI polls this every ~60s for offline
// estimates; the gateway is canonical for charged calls.
// ---------------------------------------------------------------------------
export * from './twap/index.js';

// ---------------------------------------------------------------------------
// TWAP refresh worker — pure function, no setInterval. The CLI runs this on
// a timer to keep the local TwapCache warm so /v1/estimate stays zero-latency.
// ---------------------------------------------------------------------------
export * from './workers/twap-refresh.js';

// ---------------------------------------------------------------------------
// SIWE verifier — EIP-712 signature check used by the CLI to preview a login
// envelope client-side before forwarding to the gateway. The session-issuing
// helpers are gone — the gateway mints JWTs now.
// ---------------------------------------------------------------------------
export { verifySIWESignature, SIWEAuthError, type SIWEEnvelope } from './auth/siwe.js';

// ---------------------------------------------------------------------------
// Config loader.
// ---------------------------------------------------------------------------
export { loadBillingConfig, BillingConfigError, type BillingConfig } from './config.js';
