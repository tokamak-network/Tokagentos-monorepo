import type { Plugin, IAgentRuntime } from "@tokagentos/core";
import { ConsumeService } from "./services/consume-service.js";
import { WithdrawWatcherService } from "./services/withdraw-service.js";
import { TwapRefreshService } from "./services/twap-service.js";
import { UsageCleanupService } from "./services/usage-cleanup-service.js";
import { initBillingPlugin, disposeBillingPlugin } from "./init.js";
import { authRoutes } from "./routes/auth-routes.js";
import { keysRoutes } from "./routes/keys-routes.js";

/**
 * Phase 6: full billing plugin with lifecycle management + routes.
 *
 * Lifecycle:
 *   init    — constructs shared pg.Pool, runs migrations, wires state.
 *             No-op when BILLING_ENABLED=false (Decision Z31).
 *   dispose — closes the pool and clears shared state.
 *
 * Services (registered for elizaOS lifecycle management):
 *   - ConsumeService        — scans every 30s, flushes accrued credits to ClaudeVault
 *   - WithdrawWatcherService — subscribes to vault.WithdrawRequested, triggers priority flush
 *   - TwapRefreshService    — refreshes composite TON/USD TWAP every 60s
 *   - UsageCleanupService   — sweeps expired call_log / nonces / quotes / preauth every 24h
 *
 * Routes (rawPath: true — exact paths, no plugin-name prefix):
 *   GET  /v1/auth/nonce   — issue SIWE nonce
 *   POST /v1/auth/login   — verify SIWE signature, issue JWT
 *   POST /v1/keys         — mint API key
 *   GET  /v1/keys         — list API keys
 *   DELETE /v1/keys/:id   — revoke API key
 *
 * Billing gate middleware (BILLING_HOOK seam) is wired in server.ts
 * separately — see packages/agent/src/api/server.ts.
 */
export const tokagentBillingPlugin: Plugin = {
  name: "tokagent-billing",
  description:
    "Web3 credit-billing routes and middleware for the tokagentos LLM gateway.",
  actions: [],
  providers: [],
  services: [
    ConsumeService,
    WithdrawWatcherService,
    TwapRefreshService,
    UsageCleanupService,
  ],
  routes: [...authRoutes, ...keysRoutes],

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
