import type { Plugin } from '@tokagentos/core';

/**
 * Phase 1 scaffold — registers no actions/providers/routes yet.
 * Phase 6 adds routes (auth, keys, credits, topup, usage, estimate)
 * and middleware (apiKeyResolve, rateLimit, billingGate).
 */
export const tokagentBillingPlugin: Plugin = {
  name: 'tokagent-billing',
  description: 'Web3 credit-billing routes and middleware for the tokagentos LLM gateway.',
  actions: [],
  providers: [],
};

export default tokagentBillingPlugin;
