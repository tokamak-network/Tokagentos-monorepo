# @tokagent/plugin-tokagent-shared

Shared library for Tokagent product plugins. Provides vault bindings, chain config, wallet helpers, protocol pack registry, and risk constants used across the `plugin-aave`, `plugin-polymarket`, and `plugin-hyperliquid` packages.

This is a pure ESM library — not an elizaOS Plugin itself. It has no actions or providers.

## Installation

```bash
npm install @tokagent/plugin-tokagent-shared
# or
bun add @tokagent/plugin-tokagent-shared
```

## Chain Config

Three chains are supported: Ethereum (1), Polygon (137), HyperEVM (999).

```typescript
import { getChainConfig, SUPPORTED_CHAIN_IDS } from '@tokagent/plugin-tokagent-shared';

// Get config for a chain
const eth = getChainConfig(1);
console.log(eth.name);         // "Ethereum"
console.log(eth.factoryProxy); // "0x47E6..."
console.log(eth.defaultRpc);   // "https://ethereum-rpc.publicnode.com"

// Check supported chains
console.log([...SUPPORTED_CHAIN_IDS]); // [1, 137, 999]

// Throws for unsupported chains
getChainConfig(42); // Error: Unsupported chainId: 42
```

## Wallet Helpers

```typescript
import {
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
} from '@tokagent/plugin-tokagent-shared';

// Public client (read-only)
const publicClient = getPublicClient(137);
const publicClientWithOverride = getPublicClient(137, 'https://my-rpc.example.com');

// Wallet client (read + write)
const walletClient = getWalletClient(1, '0xac0974bec...');

// Resolve private key from elizaOS runtime config
// Reads TOKAGENT_PRIVATE_KEY setting; validates 0x-prefixed 32-byte hex
const privateKey = resolveAgentPrivateKey(runtime);
```

## Vault Client

```typescript
import { TokagentVaultClient, getPublicClient } from '@tokagent/plugin-tokagent-shared';

const publicClient = getPublicClient(137);
const vault = new TokagentVaultClient('0xVAULT_ADDRESS', publicClient, walletClient);

// Read methods
const owner = await vault.owner();
const operator = await vault.operator();
const allowed = await vault.isAllowlisted('0xPoolAddress', '0x617ba037');

// Write methods (require walletClient)
await vault.executeBatch([
  { target: '0xPoolAddress', data: '0x617ba037...', value: 0n },
]);
await vault.approveToken('0xUSDC', '0xPool', 2n ** 256n - 1n);
```

## Factory Client

```typescript
import {
  TokagentFactoryClient,
  AAVE_V3_POLYGON,
  getPublicClient,
  getWalletClient,
} from '@tokagent/plugin-tokagent-shared';

const publicClient = getPublicClient(137);
const walletClient = getWalletClient(137, privateKey);
const factory = new TokagentFactoryClient('0xFACTORY', publicClient, walletClient);

// Compute deterministic address before deploying
const predicted = await factory.computeTokagentVaultAddress({
  owner: '0xOWNER',
  operator: '0xOPERATOR',
  initialAllowlist: AAVE_V3_POLYGON.entries,
  initialApprovals: AAVE_V3_POLYGON.approvals,
  userSalt: '0x' + '00'.repeat(32),
});

// Deploy
const { vault, txHash } = await factory.deployTokagentVault({
  operator: '0xOPERATOR',
  initialAllowlist: AAVE_V3_POLYGON.entries,
  initialApprovals: AAVE_V3_POLYGON.approvals,
  userSalt: '0x' + '00'.repeat(32),
});
console.log('vault deployed at', vault, 'tx', txHash);

// Discovery
const deployed = await factory.isDeployedVault(vault);
const allVaults = await factory.getAllVaults();
const count = await factory.vaultCount();
```

## Protocol Packs

```typescript
import {
  AAVE_V3_POLYGON,
  PACKS,
  findPack,
  listPacksForChain,
} from '@tokagent/plugin-tokagent-shared';

// Find a pack by id + chainId
const pack = findPack('aave-v3-polygon', 137);
// pack.entries: Array of { target, selector, humanLabel }
// pack.approvals: Array of { token, spender, humanLabel }

// List all packs for a chain
const polygonPacks = listPacksForChain(137);
```

## Risk Helpers

```typescript
import {
  MAX_APPROVAL,
  DEFAULT_SLIPPAGE_BPS,
  applySlippageDown,
  applySlippageUp,
  validateSlippageBps,
} from '@tokagent/plugin-tokagent-shared';

// Max ERC-20 approval
console.log(MAX_APPROVAL); // 2n**256n - 1n

// Apply slippage for minAmountOut (e.g., on withdrawals)
const minOut = applySlippageDown(amountOut, 100); // 1% slippage → 99% of amountOut

// Apply slippage for maxAmountIn (e.g., on swaps)
const maxIn = applySlippageUp(amountIn, 100); // 1% slippage → 101% of amountIn

// Validate slippage is in [0, 5000] bps range
validateSlippageBps(100);   // ok
validateSlippageBps(5001);  // throws RangeError
```

## Usage in a Plugin

```typescript
// plugin-aave/src/actions/supply.ts
import {
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
  TokagentVaultClient,
  AAVE_V3_POLYGON,
  applySlippageDown,
  getChainConfig,
  type AgentRuntimeLike,
} from '@tokagent/plugin-tokagent-shared';

export async function supplyToAave(
  runtime: AgentRuntimeLike,
  vaultAddress: `0x${string}`,
  amount: bigint,
) {
  const chainId = 137;
  const privateKey = resolveAgentPrivateKey(runtime);
  const publicClient = getPublicClient(chainId);
  const walletClient = getWalletClient(chainId, privateKey);
  const vault = new TokagentVaultClient(vaultAddress, publicClient, walletClient);

  const pack = AAVE_V3_POLYGON;
  const supplyEntry = pack.entries.find((e) => e.humanLabel === 'Pool.supply')!;

  // Build supply calldata (ABI-encoded separately)
  const calldata = encodeSupply(/* asset, amount, onBehalfOf, referralCode */);

  await vault.executeBatch([
    { target: supplyEntry.target, data: calldata, value: 0n },
  ]);
}
```

## License

MIT
