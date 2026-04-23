import type { Plugin } from '@elizaos/core';
import { getPerpsMarketInfoAction } from './actions/get-perps-market-info.js';
import { openPerpPositionAction } from './actions/open-perp-position.js';
import { closePerpPositionAction } from './actions/close-perp-position.js';
import { hyperliquidPositionsProvider } from './providers/hyperliquid-positions.js';

export const tokagentPerpsPlugin: Plugin = {
  name: 'tokagent-perps',
  description:
    'Hyperliquid perpetuals — read positions + market data, open/close positions via vault.',
  actions: [getPerpsMarketInfoAction, openPerpPositionAction, closePerpPositionAction],
  providers: [hyperliquidPositionsProvider],
};

export default tokagentPerpsPlugin;

export { getPerpsMarketInfoAction } from './actions/get-perps-market-info.js';
export { openPerpPositionAction } from './actions/open-perp-position.js';
export { closePerpPositionAction } from './actions/close-perp-position.js';
export { hyperliquidPositionsProvider } from './providers/hyperliquid-positions.js';
export {
  encodeCoreWriterLimitOrder,
  encodeCoreWriterUsdClassTransfer,
  encodeCoreWriterSpotSend,
  COREWRITER_VERSION,
  COREWRITER_ACTION_LIMIT_ORDER,
  COREWRITER_ACTION_SPOT_SEND,
  COREWRITER_ACTION_USD_CLASS_TRANSFER,
  COREWRITER_ADDRESS,
  HYPE_BRIDGE_ADDRESS,
  TIF_GTC,
  TIF_ALO,
  TIF_IOC,
} from './corewriter.js';
export {
  buildLimitOrderCall,
  computeLimitPriceCoreUnits,
  computeSzCoreUnits,
  resolveAssetInfo,
} from './shared/build-limit-order-call.js';
