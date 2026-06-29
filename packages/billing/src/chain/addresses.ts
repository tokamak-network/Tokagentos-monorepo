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
  /**
   * Underlying TON ERC-20 that PTON wraps on this chain. `null` where PTON is
   * not deployed, or where the canonical bridged TON is used (Ethereum). On
   * chains with no canonical TON bridge (e.g. Base), this points at a chain-side
   * TON token deployed alongside PTON, exposing a public `faucet()`.
   */
  ton?: Address | null;
  /**
   * OP-Stack bridge descriptor for chains whose TON is bridged from an L1 (e.g. Base).
   * Absent on the canonical L1 chain itself (Ethereum).
   */
  bridge?: {
    fromChainId: number;        // L1 chain id (1 = Ethereum)
    l1Token: Address;           // L1 TON to bridge (== ETHEREUM_MAINNET.ton)
    l1StandardBridge: Address;  // OP Standard Bridge on L1
    minGasLimit: number;        // depositERC20To minGasLimit
  } | null;
  /** Notes about provenance and any caveats (e.g. anvil-fork, not production). */
  notes: string;
}

/**
 * Chain 1 — Ethereum Mainnet
 *
 * LIVE production deploy. Verified on-chain (2026-06-01) against a live Ethereum
 * node: PTON 0x00D1EDcE… has bytecode, wraps the canonical TON
 * (0x2be5e8c109e2197D077D13A82dAead6a9b3433C5), faucet OFF, with real PTON in
 * circulation; ClaudeVault pton()→the live PTON.
 *
 * ClaudeVault REDEPLOYED 2026-06-09 → 0x347EaDCA53944cCbe1f43AD71Bd25677dF10EA5F
 * (deploy tx 0x072b1d486b2eaf0c651037e13836890d0d37a3e3423167c1ad4c17269a9b6532).
 * The prior vault 0x1072f70e… was deployed with operator=0x5b85411A…, but the
 * billing gateway signs/sends depositX402 as 0x3ec2c9fb… (the Base operator), so
 * every Ethereum deposit reverted NotOperator() (0x7c214f04). The new vault is a
 * BYTE-IDENTICAL redeploy of the working Base vault (0x9481…) with operator=admin
 * =0x3ec2c9fb… set in the constructor, so the gateway is now authorized on chain 1.
 *
 * admin = operator = 0x3ec2c9fb15C222Aa273F3f2F20a740FA86b4F618 (the gateway key).
 */
export const ETHEREUM_MAINNET: BillingChainAddresses = {
  chainId: 1,
  name: 'Ethereum Mainnet',
  pton: '0x00D1EDcE8E7c617891FF76224DFf501c568f1Ce0' as Address,
  claudeVault: '0x347EaDCA53944cCbe1f43AD71Bd25677dF10EA5F' as Address,
  ton: '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5' as Address,
  notes:
    'LIVE Ethereum mainnet deploy. PTON wraps canonical TON (0x2be5e8c1…3433C5), faucet OFF. ' +
    'ClaudeVault 0x347EaDCA… redeployed 2026-06-09 (byte-identical to the Base vault) with ' +
    'admin=operator=0x3ec2c9fb15C222Aa273F3f2F20a740FA86b4F618 (the gateway key) so depositX402 ' +
    'no longer reverts NotOperator(). Supersedes 0x1072f70e… (operator was 0x5b85411A…).',
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

/**
 * Chain 8453 — Base Mainnet
 *
 * LIVE production deploy (2026-06-01). Deployed via
 *   llm-api-gateway/contracts/script/DeployBase.s.sol
 * with deployer/admin/operator = 0x3ec2c9fb15C222Aa273F3f2F20a740FA86b4F618.
 *
 * Base has no canonical bridged TON, so a chain-side TON ERC-20 was deployed as
 * the wrap underlying (name "Tokamak Network Token", symbol "TON", 18 decimals)
 * with a public `faucet()`. PTON wraps it 1:1 (faucet OFF on PTON — obtain TON
 * via TON.faucet(), then PTON.deposit()).
 *
 * Deploy tx hashes (Base mainnet, chainId 8453):
 *   TON:         0x39d2e31a4104c489dd7ddd3b41e8630f12ea0f7e51525aa50f705dc30460d7f0
 *   PTON:        0xd11e80255b117f8d0149e3f5f7672b49d4c7dfeef7d90d26913cca2f0edb85c0
 *   ClaudeVault: 0xf35c76663730a339724e24a43f758e9cffd146fc7165c6b63e90b747342317a5
 */
export const BASE_MAINNET: BillingChainAddresses = {
  chainId: 8453,
  name: 'Base',
  pton: '0x26C8F112769fb3A3A8de267CfFf60E9f317445e5' as Address,
  claudeVault: '0x94815CC764EcffA8fEA1719c548F9C4980966e44' as Address,
  ton: '0xc04ecd829cD6c97cd5510b513b6419a84BA1Cc46' as Address,
  bridge: {
    fromChainId: 1,
    l1Token: '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5' as Address,
    l1StandardBridge: '0x3154Cf16ccdb4C6d922629664174b904d80F2C35' as Address,
    minGasLimit: 200000,
  },
  notes:
    'LIVE Base mainnet CANONICAL deploy (2026-06-01). L2 TON (0xc04ecd829cD6c97cd5510b513b6419a84BA1Cc46) is an OptimismMintableERC20 bridge-minted 1:1 from the real Tokamak TON on Ethereum (no faucet, supply gated to the OP StandardBridge). PTON wraps it (faucet OFF). admin=operator=0x3ec2c9fb15C222Aa273F3f2F20a740FA86b4F618. Bridge real TON via L1StandardBridge.depositERC20To, then PTON.deposit() to wrap. Supersedes the prior demo-faucet TON deploy.',
} as const;

export const BILLING_CHAIN_MAP: ReadonlyMap<number, BillingChainAddresses> = new Map([
  [ETHEREUM_MAINNET.chainId, ETHEREUM_MAINNET],
  [SEPOLIA.chainId, SEPOLIA],
  [POLYGON.chainId, POLYGON],
  [BASE_MAINNET.chainId, BASE_MAINNET],
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
