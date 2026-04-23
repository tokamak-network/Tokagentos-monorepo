import type { Address, Hex } from 'viem';

/** A single allowlisted (target, selector) pair with a human-readable label. */
export interface AllowlistEntry {
  target: Address;
  selector: Hex;
  humanLabel: string;
}

/** An ERC-20 approval that should be pre-granted when deploying with this pack. */
export interface ApprovalSpec {
  token: Address;
  spender: Address;
  humanLabel: string;
}

/** A curated protocol pack — the full allowlist + approvals needed to use one protocol. */
export interface ProtocolPack {
  id: string;
  chainId: number;
  displayName: string;
  entries: readonly AllowlistEntry[];
  approvals: readonly ApprovalSpec[];
}

// ---------------------------------------------------------------------------
// Aave v3 on Polygon
// Selectors match crates/tal-cli/src/tokagent_packs.rs
// ---------------------------------------------------------------------------
export const AAVE_V3_POLYGON: ProtocolPack = {
  id: 'aave-v3-polygon',
  chainId: 137,
  displayName: 'Aave v3 on Polygon',
  entries: [
    {
      target: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      selector: '0x617ba037',
      humanLabel: 'Pool.supply',
    },
    {
      target: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      selector: '0x69328dec',
      humanLabel: 'Pool.withdraw',
    },
    {
      target: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      selector: '0xa415bcad',
      humanLabel: 'Pool.borrow',
    },
    {
      target: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      selector: '0x573ade81',
      humanLabel: 'Pool.repay',
    },
  ],
  approvals: [
    {
      token: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      spender: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      humanLabel: 'USDC.e -> Aave Pool (max)',
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Hyperliquid Perps on HyperEVM (chain 999)
// Selectors:
//   bridgeHype(uint256)       => 0xf4e0b185  (keccak256 first 4 bytes)
//   dispatchCoreWriter(bytes) => 0xa62c829a
// ---------------------------------------------------------------------------

// NOTE: TokagentHyperEvmHelper address is a placeholder. Deploy TokagentHyperEvmHelper.s.sol
// on HyperEVM (chain 999), then update this constant (or wire via runtime config in a future PR).
// Until set to a real address, the hyperliquid-perps-hyperevm pack cannot be used.
const HYPERLIQUID_HELPER_HYPEREVM: Address = '0x0000000000000000000000000000000000000000';

const BRIDGE_HYPE_SELECTOR = '0xf4e0b185' as const;
const DISPATCH_COREWRITER_SELECTOR = '0xa62c829a' as const;

export const HYPERLIQUID_PERPS_HYPEREVM: ProtocolPack = {
  id: 'hyperliquid-perps-hyperevm',
  chainId: 999,
  displayName: 'Hyperliquid Perps (HyperEVM)',
  entries: [
    {
      target: HYPERLIQUID_HELPER_HYPEREVM,
      selector: BRIDGE_HYPE_SELECTOR,
      humanLabel: 'Helper.bridgeHype',
    },
    {
      target: HYPERLIQUID_HELPER_HYPEREVM,
      selector: DISPATCH_COREWRITER_SELECTOR,
      humanLabel: 'Helper.dispatchCoreWriter',
    },
  ],
  approvals: [],
} as const;

/** All registered protocol packs. New packs are added in subsequent PRs. */
export const PACKS: readonly ProtocolPack[] = [AAVE_V3_POLYGON, HYPERLIQUID_PERPS_HYPEREVM];

/**
 * Find a pack by id + chainId. Returns undefined if not found.
 */
export function findPack(id: string, chainId: number): ProtocolPack | undefined {
  return PACKS.find((p) => p.id === id && p.chainId === chainId);
}

/**
 * List all packs available for a given chain.
 */
export function listPacksForChain(chainId: number): ProtocolPack[] {
  return PACKS.filter((p) => p.chainId === chainId);
}
