import type { Plugin, IAgentRuntime } from "@tokagentos/core";
import { ConsumeService } from "./services/consume-service.js";
import { WithdrawWatcherService } from "./services/withdraw-service.js";
import { TwapRefreshService } from "./services/twap-service.js";
import { UsageCleanupService } from "./services/usage-cleanup-service.js";
import { BillingMiddlewareService } from "./services/billing-middleware-service.js";
import { initBillingPlugin, disposeBillingPlugin } from "./init.js";
import { getAuthRoutes } from "./routes/auth-routes.js";
import { getKeysRoutes } from "./routes/keys-routes.js";
import { getCreditsRoutes } from "./routes/credits-routes.js";
import { getTopupRoutes } from "./routes/topup-routes.js";
import { getUsageRoutes } from "./routes/usage-routes.js";
import { getEstimateRoutes } from "./routes/estimate-routes.js";
// Phase 9: conversational setup action + routes
import { setupBillingAction } from "./actions/setup-billing.js";
import { getSetupRoutes } from "./routes/setup-routes.js";
import { getSetupPanelRoutes } from "./routes/setup-panel-routes.js";
// Operator dashboard SPA (migrated from llm-api-gateway)
import { getDashboardRoutes } from "./routes/dashboard-routes.js";

/**
 * Detect the BILLING_MODE at module-load time. The Plugin.routes array is
 * static, so we MUST resolve the mode before the plugin object is exported.
 *
 * - Default: 'server' (v2.0.5 — self-hosted-first; a fresh install boots into
 *   server-mode with BILLING_ENABLED=false; the operator runs the 7-field
 *   setup wizard to opt in).
 * - 'client': operator explicitly opts into client-mode and supplies
 *   TOKAGENT_GATEWAY_URL pointing at the tokagent-billing-server they're a
 *   client of. Tokagent billing is self-hosted only — there is no default
 *   gateway URL.
 *
 * Any value other than the two known modes falls back to 'server' so the
 * plugin defaults to the safe, opt-in flow rather than silently trying to
 * forward to a missing URL.
 */
const BILLING_MODE: "server" | "client" =
  process.env.BILLING_MODE === "client" ? "client" : "server";

/**
 * v2.0.0: full billing plugin with lifecycle management + routes.
 *
 * Modes:
 *   server (default) — owns Postgres, runs settlement workers, exposes the
 *                      full billing API directly. Operator opts in by running
 *                      the setup wizard.
 *   client           — pure HTTPS forwarder pointing at TOKAGENT_GATEWAY_URL
 *                      (REQUIRED — supplied by the operator of the billing
 *                      server you're a client of). No database, no workers,
 *                      no chain writes. Every /v1/* route proxies the request
 *                      to the upstream tokagent-billing-server.
 *
 * Lifecycle:
 *   init    — server-mode: constructs shared pg.Pool, runs migrations,
 *             wires state.
 *             client-mode: constructs GatewayProxy and attaches to state.
 *             Both: no-op when BILLING_ENABLED=false in server-mode.
 *   dispose — closes the pool (server-mode) or clears the gateway client
 *             (client-mode) and clears shared state.
 *
 * Services (server-mode only — registered for elizaOS lifecycle management):
 *   - ConsumeService           — scans every 30s, flushes accrued credits to ClaudeVault
 *   - WithdrawWatcherService   — subscribes to vault.WithdrawRequested, triggers priority flush
 *   - TwapRefreshService       — refreshes composite TON/USD TWAP every 60s
 *   - UsageCleanupService      — sweeps expired call_log / nonces / quotes / preauth every 24h
 *   - BillingMiddlewareService — exposes applyBillingMiddleware via the runtime registry
 *                                so server.ts can late-bind state.billingMiddleware (Z33).
 *
 * In client-mode these services are not registered — the upstream gateway
 * runs them. Routes are mode-aware (factories below) and either dispatch
 * locally (server-mode) or forward to the gateway (client-mode).
 *
 * Routes (rawPath: true — exact paths, no plugin-name prefix):
 *   GET  /v1/auth/nonce              — issue SIWE nonce
 *   POST /v1/auth/login              — verify SIWE signature, issue JWT
 *   POST /v1/keys                    — mint API key
 *   GET  /v1/keys                    — list API keys
 *   DELETE /v1/keys/:id              — revoke API key
 *   GET  /v1/credits/me              — credit ledger state for the caller
 *   GET  /v1/topup/info              — EIP-712 domain for client signing
 *   POST /v1/topup/quote             — PTON quote for a USD deposit
 *   POST /v1/topup/settle            — submit signed EIP-3009 to vault
 *   POST /v1/topup/preauth           — store pre-signed authorization slots
 *   GET  /v1/topup/status            — next available preauth slot
 *   POST /v1/topup/revoke            — poison a preauth slot by nonce
 *   GET  /v1/quote/:id               — debug: fetch quote by ID
 *   GET  /v1/usage/summary           — aggregated tokens + cost over a window
 *   GET  /v1/usage/calls             — paginated call log
 *   GET  /v1/usage/keys              — per-API-key usage breakdown
 *   GET  /v1/stats                   — operator aggregate counts (debug)
 *   POST /v1/estimate                — max cost estimate without charging
 *   POST /v1/messages/count_tokens   — Anthropic-compatible token count
 *   GET  /v1/price                   — debug: current TWAP cache state
 *
 * Billing gate middleware (BILLING_HOOK seam) is late-bound in server.ts
 * via BillingMiddlewareService — in client-mode this becomes a passthrough
 * (the upstream gateway enforces billing).
 */
export const tokagentBillingPlugin: Plugin = {
  name: "tokagent-billing",
  description:
    "Web3 credit-billing routes and middleware for the tokagentos LLM gateway. " +
    "Runs in server-mode (owns Postgres + settlement workers) or client-mode " +
    "(pure HTTPS forwarder pointing at an operator-provided TOKAGENT_GATEWAY_URL).",
  // Phase 9: SETUP_BILLING action enables the conversational setup flow (Z46).
  // Available in both modes — wizard branches on mode at run time.
  actions: [setupBillingAction],
  providers: [],
  // Server-mode owns settlement workers. Client-mode skips them because the
  // upstream gateway runs them; mounting them locally would race the gateway
  // for nonces and double-charge.
  services:
    BILLING_MODE === "server"
      ? [
          ConsumeService,
          WithdrawWatcherService,
          TwapRefreshService,
          UsageCleanupService,
          BillingMiddlewareService,
        ]
      : [],
  routes: [
    ...getAuthRoutes(BILLING_MODE),
    ...getKeysRoutes(BILLING_MODE),
    ...getCreditsRoutes(BILLING_MODE),
    ...getTopupRoutes(BILLING_MODE),
    ...getUsageRoutes(BILLING_MODE),
    ...getEstimateRoutes(BILLING_MODE),
    // Setup routes branch on mode (different wizard UX).
    ...getSetupRoutes(BILLING_MODE),
    ...getSetupPanelRoutes(BILLING_MODE),
    // Operator dashboard SPA — same in both modes (SPA reads /v1/* from
    // the same origin; whichever mode is active answers the calls).
    ...getDashboardRoutes(BILLING_MODE),
  ],

  async init(
    _config: Record<string, string>,
    runtime: IAgentRuntime,
  ): Promise<void> {
    await initBillingPlugin(runtime);
  },

  async dispose(_runtime: IAgentRuntime): Promise<void> {
    await disposeBillingPlugin();
  },
};

export default tokagentBillingPlugin;
