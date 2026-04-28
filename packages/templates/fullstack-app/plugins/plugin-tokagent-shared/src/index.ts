// ABIs
export { TokagentVaultABI } from './abi/TokagentVault.js';

// Clients
export { TokagentVaultClient } from './clients/TokagentVaultClient.js';
export { TokagentFactoryClient } from './clients/TokagentFactoryClient.js';
export type {
  DeployTokagentVaultParams,
  ComputeTokagentVaultAddressParams,
} from './clients/TokagentFactoryClient.js';

// Config
export {
  SUPPORTED_CHAIN_IDS,
  getChainConfig,
  ETHEREUM_CONFIG,
  POLYGON_CONFIG,
  HYPEREVM_CONFIG,
  type ChainConfig,
} from './chain-config.js';

// Protocol packs
export {
  AAVE_V3_POLYGON,
  HYPERLIQUID_PERPS_HYPEREVM,
  PACKS,
  findPack,
  listPacksForChain,
  type ProtocolPack,
  type AllowlistEntry,
  type ApprovalSpec,
} from './protocol-packs.js';

// Wallet
export {
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
  type AgentRuntimeLike,
} from './wallet.js';

// Env persistence (vault address durability across restarts)
export { persistVaultAddress, upsertEnvLine } from './env-persistence.js';

// Risk
export {
  MAX_APPROVAL,
  DEFAULT_SLIPPAGE_BPS,
  BPS_DENOMINATOR,
  applySlippageDown,
  applySlippageUp,
  validateSlippageBps,
} from './risk.js';

// Types
export type { TokagentEntry, TokagentCall } from './clients/TokagentVaultClient.js';

// Action result helpers
export { tokagentActionError, tokagentActionFailure } from './action-result.js';
