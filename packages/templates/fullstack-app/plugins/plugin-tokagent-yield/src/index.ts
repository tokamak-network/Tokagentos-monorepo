import type { Plugin } from '@elizaos/core';
import { depositToAaveAction } from './actions/deposit-to-aave.js';
import { withdrawFromAaveAction } from './actions/withdraw-from-aave.js';
import { aavePositionsProvider } from './providers/aave-positions.js';

export const tokagentYieldPlugin: Plugin = {
  name: 'tokagent-yield',
  description: 'Deposit and withdraw from Aave v3 via the Tokagent vault.',
  actions: [depositToAaveAction, withdrawFromAaveAction],
  providers: [aavePositionsProvider],
};

export default tokagentYieldPlugin;

export { depositToAaveAction } from './actions/deposit-to-aave.js';
export { withdrawFromAaveAction } from './actions/withdraw-from-aave.js';
export { aavePositionsProvider } from './providers/aave-positions.js';
