import type { Plugin } from "@tokagentos/core";
import { ConsumeService } from "./services/consume-service.js";
import { WithdrawWatcherService } from "./services/withdraw-service.js";
import { TwapRefreshService } from "./services/twap-service.js";
import { UsageCleanupService } from "./services/usage-cleanup-service.js";

/**
 * Phase 5: registers four lifecycle-managed billing services.
 *
 *   - ConsumeService        — scans every 30s, flushes accrued credits to ClaudeVault
 *   - WithdrawWatcherService — subscribes to vault.WithdrawRequested, triggers priority flush
 *   - TwapRefreshService    — refreshes composite TON/USD TWAP every 60s
 *   - UsageCleanupService   — sweeps expired call_log / nonces / quotes / preauth every 24h
 *
 * Routes/middleware (auth, keys, credits, topup, usage, estimate) land in Phase 6.
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
};

export default tokagentBillingPlugin;
