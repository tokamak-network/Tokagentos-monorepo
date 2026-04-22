import type { Plugin } from '@tokagentos/core';
import { getPerpsMarketInfoAction } from './actions/get-perps-market-info.js';
import { hyperliquidPositionsProvider } from './providers/hyperliquid-positions.js';

export const tokagentPerpsPlugin: Plugin = {
  name: 'tokagent-perps',
  description: 'Read Hyperliquid perpetuals positions and market data via the Tokagent vault.',
  actions: [getPerpsMarketInfoAction],
  providers: [hyperliquidPositionsProvider],
};

export default tokagentPerpsPlugin;

export { getPerpsMarketInfoAction } from './actions/get-perps-market-info.js';
export { hyperliquidPositionsProvider } from './providers/hyperliquid-positions.js';
