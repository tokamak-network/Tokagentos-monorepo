import type { Address } from 'viem';

export interface ChainConfig {
  chainId: number;
  name: string;
  factoryProxy: Address;
  defaultRpc: string;
  nativeSymbol: string;
  explorerUrl: string;
}

// Factory proxy addresses sourced from sdk/src/addresses.ts
export const ETHEREUM_CONFIG: ChainConfig = {
  chainId: 1,
  name: 'Ethereum',
  factoryProxy: '0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39',
  defaultRpc: 'https://ethereum-rpc.publicnode.com',
  nativeSymbol: 'ETH',
  explorerUrl: 'https://etherscan.io',
} as const;

export const POLYGON_CONFIG: ChainConfig = {
  chainId: 137,
  name: 'Polygon',
  factoryProxy: '0x0eDa0bCFBFc51Ab245F078AEFa3ee42cB384c865',
  defaultRpc: 'https://polygon-bor-rpc.publicnode.com',
  nativeSymbol: 'MATIC',
  explorerUrl: 'https://polygonscan.com',
} as const;

export const HYPEREVM_CONFIG: ChainConfig = {
  chainId: 999,
  name: 'HyperEVM',
  factoryProxy: '0xd27A7470a34903b7e215EA8d07d9cd2d21238F83',
  defaultRpc: 'https://rpc.hyperliquid.xyz/evm',
  nativeSymbol: 'HYPE',
  explorerUrl: 'https://www.hyperevmscan.io',
} as const;

const CHAIN_MAP: ReadonlyMap<number, ChainConfig> = new Map([
  [ETHEREUM_CONFIG.chainId, ETHEREUM_CONFIG],
  [POLYGON_CONFIG.chainId, POLYGON_CONFIG],
  [HYPEREVM_CONFIG.chainId, HYPEREVM_CONFIG],
]);

/** Set of chain IDs supported by this plugin suite. */
export const SUPPORTED_CHAIN_IDS: ReadonlySet<number> = new Set(CHAIN_MAP.keys());

/**
 * Returns the chain configuration for the given chain ID.
 * Throws if the chain is not supported.
 */
export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_MAP.get(chainId);
  if (!config) {
    throw new Error(
      `Unsupported chainId: ${chainId}. Supported chains: ${[...SUPPORTED_CHAIN_IDS].join(', ')}`,
    );
  }
  return config;
}
