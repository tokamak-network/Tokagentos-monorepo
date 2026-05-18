/**
 * @tokagent/plugin-tokagent-billing — v2.0.0 thin client.
 *
 * Every billing-gated route forwards to a hosted gateway over HTTPS
 * (`TOKAGENT_GATEWAY_URL`, default `https://gateway.tokagent.ai`). The CLI
 * keeps only:
 *   - The /v1/* route registrations (so consumers don't see a wire change).
 *   - A local TwapRefreshService that warms a TWAP cache for offline
 *     /v1/estimate and /v1/messages/count_tokens quotes.
 *   - The BillingMiddlewareService passthrough that satisfies the agent
 *     server's BILLING_HOOK contract (Decision Z33).
 *   - A conversational SETUP_BILLING action that surfaces the gateway URL
 *     and reminds the user where to put it.
 *
 * No DB, no operator key, no chain-write workers, no migrations.
 */

import type { Plugin, IAgentRuntime } from '@tokagentos/core';
import { TwapRefreshService } from './services/twap-service.js';
import { BillingMiddlewareService } from './services/billing-middleware-service.js';
import { initBillingPlugin, disposeBillingPlugin } from './init.js';
import { authRoutes } from './routes/auth-routes.js';
import { keysRoutes } from './routes/keys-routes.js';
import { creditsRoutes } from './routes/credits-routes.js';
import { topupRoutes } from './routes/topup-routes.js';
import { usageRoutes } from './routes/usage-routes.js';
import { estimateRoutes } from './routes/estimate-routes.js';
import { chatRoutes } from './routes/chat.js';
import { setupBillingAction } from './actions/setup-billing.js';

export const tokagentBillingPlugin: Plugin = {
  name: 'tokagent-billing',
  description:
    'Web3 credit-billing routes for tokagentos — v2.0.0 thin client that ' +
    'forwards every billing request to the hosted gateway at ' +
    'TOKAGENT_GATEWAY_URL.',
  actions: [setupBillingAction],
  providers: [],
  services: [
    TwapRefreshService,
    BillingMiddlewareService,
  ],
  routes: [
    ...authRoutes,
    ...keysRoutes,
    ...creditsRoutes,
    ...topupRoutes,
    ...usageRoutes,
    ...estimateRoutes,
    ...chatRoutes,
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
