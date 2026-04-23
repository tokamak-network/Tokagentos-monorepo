import type { Plugin } from '@elizaos/core';
import { describePolymarketMarketAction } from './actions/describe-polymarket-market.js';
import { polymarketPositionsProvider } from './providers/polymarket-positions.js';

export const tokagentPolymarketPlugin: Plugin = {
  name: 'tokagent-polymarket',
  description: 'Read Polymarket prediction market positions and odds via the Tokagent vault.',
  actions: [describePolymarketMarketAction],
  providers: [polymarketPositionsProvider],
};

export default tokagentPolymarketPlugin;

export { describePolymarketMarketAction } from './actions/describe-polymarket-market.js';
export { polymarketPositionsProvider } from './providers/polymarket-positions.js';
