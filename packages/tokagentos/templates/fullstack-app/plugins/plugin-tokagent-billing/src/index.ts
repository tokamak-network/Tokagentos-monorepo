import type { Plugin, IAgentRuntime } from "@elizaos/core";
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
// LiteLLM proxy for /v1/messages + /v1/chat/completions (server-mode only)
import { getMessagesProxyRoutes } from "./routes/messages-proxy-routes.js";

/**
 * Detect the BILLING_MODE at module-load time. The Plugin.routes array is
 * static, so we MUST resolve the mode before the plugin object is exported.
 *
 * - Default: 'client' (v2.0.7 — Railway-hosted-first; a fresh install connects
 *   to the Tokamak-hosted billing server at billing-service-production-a8e7.up.railway.app
 *   by default. The operator overrides TOKAGENT_GATEWAY_URL to point at their
 *   own server, or sets BILLING_MODE=server to self-host).
 * - 'server': operator explicitly opts into self-hosting. Requires DB + chain
 *   envs. The 7-field setup wizard is still available via /v1/billing/setup-panel.
 *
 * Any value other than the two known modes falls back to 'client' (the Railway
 * default) so a fresh install works out of the box.
 */
const BILLING_MODE: "server" | "client" =
  process.env.BILLING_MODE === "server" ? "server" : "client";

/**
 * Env keys that indicate the user has configured a direct LLM provider —
 * their own API key, not the x402 billing rail. Keep this aligned with
 * @tokagentos/agent's PROVIDER_PLUGIN_MAP / AUTH_PROVIDER_PLUGINS so a new
 * direct-provider plugin upstream automatically opts users out here.
 */
const DIRECT_LLM_PROVIDER_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "GROK_API_KEY",
  "ZAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "MISTRAL_API_KEY",
  "TOGETHER_API_KEY",
  "AI_GATEWAY_API_KEY",
  "AIGATEWAY_API_KEY",
  "OLLAMA_BASE_URL",
] as const;

/**
 * True when the user has wired a direct LLM provider AND has NOT set
 * BILLING_CHAT_KEY. In that case the user wants chat routed through their
 * own provider plugin, not the x402 gateway proxy — so the billing plugin
 * MUST NOT claim /v1/messages and /v1/chat/completions. Without this guard
 * the proxy intercepts those paths and rejects every chat request (no
 * BILLING_CHAT_KEY → no sk-ai-* auth header → 401), which the agent UI
 * surfaces as the generic "Sorry, I'm having a provider issue".
 *
 * BILLING_CHAT_KEY being set is the explicit "I want chat to flow through
 * the billing rail" signal — when present, keep the proxy active even if a
 * direct provider key is also set (advanced setups).
 *
 * The billing tab, top-up, dashboard, auth, and key-management routes stay
 * registered — only the chat-message proxy is skipped. The user can still
 * mint keys, top up PTON, and switch to x402 later by setting
 * BILLING_CHAT_KEY (which flips this flag back).
 */
const HAS_BILLING_CHAT_KEY = !!process.env.BILLING_CHAT_KEY?.trim();
const HAS_DIRECT_LLM_PROVIDER = DIRECT_LLM_PROVIDER_ENV_KEYS.some(
  (key) => !!process.env[key]?.trim(),
);
const SKIP_CHAT_PROXY = HAS_DIRECT_LLM_PROVIDER && !HAS_BILLING_CHAT_KEY;

if (SKIP_CHAT_PROXY) {
  // Use console.info because the elizaOS logger isn't initialized at
  // module-load time. Mirrors the same logging style as the LiteLLM /
  // BILLING_CHAT_KEY mirror in scaffold-patched core-plugins.ts.
  console.info(
    "[tokagent-billing] direct LLM provider key detected (one of: " +
      DIRECT_LLM_PROVIDER_ENV_KEYS.filter(
        (key) => !!process.env[key]?.trim(),
      ).join(", ") +
      ") — skipping /v1/messages + /v1/chat/completions proxy so the " +
      "direct provider plugin handles chat. Billing tab remains available; " +
      "set BILLING_CHAT_KEY to re-route chat through the x402 gateway.",
  );
}

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
  // Server-mode owns settlement workers. Client-mode (default in v2.0.7) skips
  // them because the upstream Railway gateway runs them; mounting them locally
  // would race the gateway for nonces and double-charge.
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
    // MUST be registered BEFORE other routes — these own /v1/messages and
    // /v1/chat/completions in server-mode and run a pure LiteLLM proxy.
    // Without these, elizaOS's chat-routes.ts dispatcher tries to handle
    // /v1/messages as an agent chat (requires worlds DB + AI provider
    // plugin) and fails with "tableName is required" on a billing-only
    // deployment.
    //
    // Skipped when the user has a direct LLM provider key configured and
    // no BILLING_CHAT_KEY — see SKIP_CHAT_PROXY above. Without this guard,
    // the proxy rejects every chat request with a generic auth failure that
    // the agent UI surfaces as "Sorry, I'm having a provider issue".
    ...(SKIP_CHAT_PROXY ? [] : getMessagesProxyRoutes(BILLING_MODE)),
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
