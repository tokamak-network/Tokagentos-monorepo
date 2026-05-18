/**
 * Plugin-internal singleton for the billing plugin (v2.0.0 thin-client).
 *
 * v1.x held a pg.Pool + Drizzle handle + viem clients. v2.x holds the typed
 * gateway client, the resolved billing config, and an optional TWAP cache
 * the local offline-estimate path keeps warm. There is no DB connection
 * anywhere in this plugin anymore.
 */

import type { BillingConfig } from '@tokagentos/billing';
import type { TwapCache } from '@tokagentos/billing';
import type { GatewayClient } from './lib/gateway-proxy.js';

export interface BillingPluginState {
  config: BillingConfig;
  gateway: GatewayClient;
  /**
   * Local TWAP cache populated by TwapRefreshService. Used only by the
   * CLI's offline /v1/estimate and /v1/messages/count_tokens routes.
   * Optional — the service may not have started yet.
   */
  twapCache?: TwapCache;
}

let _state: BillingPluginState | null = null;

export function setBillingState(state: BillingPluginState): void {
  if (_state) {
    throw new Error(
      'Billing state already initialized; call clearBillingState() first',
    );
  }
  _state = state;
}

export function getBillingState(): BillingPluginState {
  if (!_state) {
    throw new Error(
      'Billing state not initialized — did Plugin.init run? ' +
        'Ensure the tokagent-billing plugin is loaded and BILLING_ENABLED=true.',
    );
  }
  return _state;
}

export async function clearBillingState(): Promise<void> {
  _state = null;
}

export function registerTwapCache(cache: TwapCache): void {
  if (_state) {
    _state.twapCache = cache;
  }
}

export function isBillingStateInitialized(): boolean {
  return _state !== null;
}
