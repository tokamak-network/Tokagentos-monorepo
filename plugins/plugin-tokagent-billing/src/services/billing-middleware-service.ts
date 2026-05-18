/**
 * BillingMiddlewareService — v2.0.0 passthrough.
 *
 * The agent server's BILLING_HOOK looks up this service via the runtime
 * registry and assigns `.middleware` to `state.billingMiddleware`. The
 * service contract (Z33) is preserved so the agent does not need any
 * v2.x-specific knowledge.
 *
 * In v1.x the middleware reserved credits and returned commit/release
 * closures. In v2.x it returns `{allow: true}` unconditionally — the
 * hosted gateway is the canonical enforcer of auth, rate limiting, and
 * credit reservation. The plugin's `/v1/messages` route forwards the
 * request (with the original Authorization / x-api-key headers) and the
 * gateway responds 402 / 429 / 401 as appropriate.
 */

import { Service, type IAgentRuntime } from '@tokagentos/core';
import {
  applyBillingMiddleware,
  type BillingMiddlewareResult,
} from '../middleware/index.js';
import type { IncomingMessage } from 'node:http';

export type BillingMiddlewareFn = (
  req: IncomingMessage,
  body: unknown,
  pathname: string,
) => Promise<BillingMiddlewareResult>;

export class BillingMiddlewareService extends Service {
  static serviceType = 'tokagent-billing-middleware';
  capabilityDescription =
    'v2.0.0 passthrough — exposes the BILLING_HOOK seam expected by the agent server (Decision Z33). The gateway is the canonical enforcer.';

  readonly middleware: BillingMiddlewareFn = applyBillingMiddleware;

  static async start(runtime: IAgentRuntime): Promise<BillingMiddlewareService> {
    return new BillingMiddlewareService(runtime);
  }

  async stop(): Promise<void> {
    /* no resources to release */
  }
}
