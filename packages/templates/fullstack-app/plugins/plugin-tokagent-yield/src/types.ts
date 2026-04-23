import type { Address } from 'viem';

/** Aave v3 Polygon constants */
export const AAVE_V3_POOL_ADDRESS: Address = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
export const USDC_E_ADDRESS: Address = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
export const AUSDC_E_ADDRESS: Address = '0x625E7708f30cA75bfd92586e17077590C60eb4cD';

/** ABI fragments used by this plugin */
export const POOL_SUPPLY_ABI = [
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' },
    ],
    outputs: [],
  },
] as const;

export const POOL_WITHDRAW_ABI = [
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const WITHDRAW_ALL = BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
);

/** Data returned by the aavePositions provider */
export interface AavePositionsData {
  chainId: number;
  atokenAddress: string;
  atokenBalance: string;
  humanBalance: number;
}
