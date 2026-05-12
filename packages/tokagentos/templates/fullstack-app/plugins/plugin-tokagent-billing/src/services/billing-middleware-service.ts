/**
 * BillingMiddlewareService — elizaOS Service wrapper that exposes
 * `applyBillingMiddleware` to the agent server via the runtime service registry.
 *
 * Decision Z33 — late-bind via service registry:
 *   The agent server calls `runtime.getService('tokagent-billing-middleware')`
 *   after the billing plugin has been loaded. If the service is present it
 *   reads `.middleware` and assigns it to `state.billingMiddleware`, activating
 *   the BILLING_HOOK seam that was wired in Phase 6a.
 *
 *   No hard imports from `@tokagentos/agent` into the billing plugin. The
 *   Service registry is the decoupling mechanism.
 *
 * This is intentionally a thin wrapper — the real gate logic lives in
 * `../middleware/index.ts` (`applyBillingMiddleware`).
 */

import { Service, type IAgentRuntime } from "@elizaos/core";
import { applyBillingMiddleware, type BillingMiddlewareResult } from "../middleware/index.js";
import type { IncomingMessage } from "node:http";

// ---------------------------------------------------------------------------
// Public type: shape of the middleware function exposed to the agent server.
// ---------------------------------------------------------------------------

export type BillingMiddlewareFn = (
  req: IncomingMessage,
  body: unknown,
  pathname: string,
) => Promise<BillingMiddlewareResult>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BillingMiddlewareService extends Service {
  static serviceType = "tokagent-billing-middleware";
  capabilityDescription =
    "Exposes applyBillingMiddleware to the agent server BILLING_HOOK seam (Decision Z33)";

  /**
   * The middleware function. The agent server reads this property via:
   * ```ts
   * const svc = runtime.getService<BillingMiddlewareService>('tokagent-billing-middleware');
   * if (svc && 'middleware' in svc) {
   *   state.billingMiddleware = svc.middleware;
   * }
   * ```
   */
  readonly middleware: BillingMiddlewareFn = applyBillingMiddleware;

  static async start(runtime: IAgentRuntime): Promise<BillingMiddlewareService> {
    return new BillingMiddlewareService(runtime);
  }

  async stop(): Promise<void> {
    // No resources to release — the middleware function is stateless.
    // The module-level rate-limiter singletons (quota/settle limiters) are
    // reset by `resetBillingLimiters()` called from Plugin.dispose.
  }
}
