import type { Address } from 'viem';

/**
 * Deployed addresses for the PTON token and ClaudeVault credit hub,
 * staged for Phase 1 of the llm-api-gateway integration.
 *
 * Source repo: llm-api-gateway/contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json
 * On chains where no deployment exists yet, fields are `null` and must be
 * populated before BILLING_ENABLED=true on that chain.
 */
export interface BillingChainAddresses {
  chainId: number;
  name: string;
  pton: Address | null;
  claudeVault: Address | null;
  /** Notes about provenance and any caveats (e.g. anvil-fork, not production). */
  notes: string;
}

/**
 * Chain 1 — Ethereum Mainnet
 *
 * WARNING: The broadcast artifacts at
 *   llm-api-gateway/contracts/broadcast/Deploy.s.sol/1/run-latest.json
 * use chainId=1 but the deployer address (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
 * is the default Hardhat/Anvil account #0, and the source .env.example sets
 * MAINNET_RPC_URL=http://127.0.0.1:8545 (local Anvil fork).
 * These addresses are from an Anvil mainnet-fork deploy, NOT a live production
 * mainnet deploy. Do NOT treat as production-mainnet without independent verification
 * against a live Ethereum node.
 *
 * Source tx hashes (Anvil fork):
 *   PTON:        0x2018b39cb9a109a093b826b954fe73ab202f58720cf979b346e8e17b2f24cfad
 *   ClaudeVault: 0xd8ab20a7db18bd7293874f8c6964a2c9a17cb2ed80c1a9e9460baa9e6115bc9c
 */
export const ETHEREUM_MAINNET: BillingChainAddresses = {
  chainId: 1,
  name: 'Ethereum Mainnet',
  pton: '0x1aa43c68e7e9cf1669eccf5f8f704f766128d466' as Address,
  claudeVault: '0xeae2f21073290ec7cba7c6140352a805dd9678ce' as Address,
  notes:
    'Anvil mainnet-fork deploy (deployer=0xf39Fd6e51...92266, the default Anvil account). ' +
    'MAINNET_RPC_URL in source .env.example points to http://127.0.0.1:8545. ' +
    'Verify against live Ethereum node before setting BILLING_ENABLED=true on mainnet.',
} as const;

/**
 * Chain 11155111 — Sepolia Testnet
 *
 * No deployment exists yet. Populate before enabling billing on Sepolia.
 */
export const SEPOLIA: BillingChainAddresses = {
  chainId: 11155111,
  name: 'Sepolia',
  pton: null,
  claudeVault: null,
  notes: 'Not deployed — populate pton and claudeVault before enabling on Sepolia.',
} as const;

/**
 * Chain 137 — Polygon Mainnet
 *
 * No deployment exists yet. Populate before enabling billing on Polygon.
 */
export const POLYGON: BillingChainAddresses = {
  chainId: 137,
  name: 'Polygon',
  pton: null,
  claudeVault: null,
  notes: 'Not deployed — populate pton and claudeVault before enabling on Polygon.',
} as const;

export const BILLING_CHAIN_MAP: ReadonlyMap<number, BillingChainAddresses> = new Map([
  [ETHEREUM_MAINNET.chainId, ETHEREUM_MAINNET],
  [SEPOLIA.chainId, SEPOLIA],
  [POLYGON.chainId, POLYGON],
]);

/**
 * Returns the billing chain addresses for the given chainId, or undefined if
 * the chain is not yet registered.
 *
 * Note: a non-undefined return does NOT guarantee that `pton` and `claudeVault`
 * are populated — check for null before constructing viem clients.
 */
export function getBillingChainAddresses(chainId: number): BillingChainAddresses | undefined {
  return BILLING_CHAIN_MAP.get(chainId);
}
