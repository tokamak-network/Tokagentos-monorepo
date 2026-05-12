import type { Plugin, IAgentRuntime } from "@elizaos/core";
import { ConsumeService } from "./services/consume-service.js";
import { WithdrawWatcherService } from "./services/withdraw-service.js";
import { TwapRefreshService } from "./services/twap-service.js";
import { UsageCleanupService } from "./services/usage-cleanup-service.js";
import { BillingMiddlewareService } from "./services/billing-middleware-service.js";
import { initBillingPlugin, disposeBillingPlugin } from "./init.js";
import { authRoutes } from "./routes/auth-routes.js";
import { keysRoutes } from "./routes/keys-routes.js";
import { creditsRoutes } from "./routes/credits-routes.js";
import { topupRoutes } from "./routes/topup-routes.js";
import { usageRoutes } from "./routes/usage-routes.js";
import { estimateRoutes } from "./routes/estimate-routes.js";
// Phase 9: conversational setup action + routes
import { setupBillingAction } from "./actions/setup-billing.js";
import { setupRoutes } from "./routes/setup-routes.js";
import { setupPanelRoutes } from "./routes/setup-panel-routes.js";
// Operator dashboard SPA (migrated from llm-api-gateway)
import { dashboardRoutes } from "./routes/dashboard-routes.js";

/**
 * Phase 6b: full billing plugin with lifecycle management + routes.
 *
 * Lifecycle:
 *   init    — constructs shared pg.Pool, runs migrations, wires state.
 *             No-op when BILLING_ENABLED=false (Decision Z31).
 *   dispose — closes the pool and clears shared state.
 *
 * Services (registered for elizaOS lifecycle management):
 *   - ConsumeService           — scans every 30s, flushes accrued credits to ClaudeVault
 *   - WithdrawWatcherService   — subscribes to vault.WithdrawRequested, triggers priority flush
 *   - TwapRefreshService       — refreshes composite TON/USD TWAP every 60s
 *   - UsageCleanupService      — sweeps expired call_log / nonces / quotes / preauth every 24h
 *   - BillingMiddlewareService — exposes applyBillingMiddleware via the runtime registry
 *                                so server.ts can late-bind state.billingMiddleware (Z33).
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
 * via BillingMiddlewareService — see packages/agent/src/api/server.ts.
 * (Decision Z33)
 */
export const tokagentBillingPlugin: Plugin = {
  name: "tokagent-billing",
  description:
    "Web3 credit-billing routes and middleware for the tokagentos LLM gateway.",
  // Phase 9: SETUP_BILLING action enables the conversational setup flow (Z46).
  actions: [setupBillingAction],
  providers: [],
  services: [
    ConsumeService,
    WithdrawWatcherService,
    TwapRefreshService,
    UsageCleanupService,
    BillingMiddlewareService,
  ],
  routes: [
    ...authRoutes,
    ...keysRoutes,
    ...creditsRoutes,
    ...topupRoutes,
    ...usageRoutes,
    ...estimateRoutes,
    // Phase 9: setup routes (POST /v1/billing/setup, POST /v1/billing/validate)
    ...setupRoutes,
    // Phase 9: setup panel HTML UI (GET /v1/billing/setup-panel)
    ...setupPanelRoutes,
    // Operator dashboard SPA — GET /v1/billing/dashboard
    ...dashboardRoutes,
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
