import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

/**
 * Set of viem clients the billing layer needs.
 *
 * Constructed once per process by the lifecycle owner (Phase 6 plugin init)
 * and threaded through to every chain-write function. No singleton state in
 * this module — call sites that need test isolation simply construct a new
 * `BillingClients` with mock transports.
 *
 * Decision Z5: we do NOT reuse `plugin-tokagent-shared/src/wallet.ts`
 * `getPublicClient/getWalletClient`. The billing layer has a narrower chain
 * set (Ethereum mainnet for TWAP + one configurable L2 for vault), and forcing
 * chainId resolution through the shared chain registry would require wiring the
 * full tokagent chain registry into billing. Duplication is intentional here.
 *
 * Decision Z6: no ES Proxy lazy-init. All chain functions take an explicit
 * `BillingClients` object. This makes dependencies testable without mocking
 * process.env or import order.
 */
export interface BillingClients {
  /** L2 chain client — vault reads + writes. */
  publicClient: PublicClient;
  /** L2 chain client — operator signer for vault writes. */
  walletClient: WalletClient;
  /** Ethereum mainnet client — TWAP reads only. */
  mainnetClient: PublicClient;
  /** Operator account derived from BILLING_OPERATOR_PRIVATE_KEY. */
  operatorAccount: PrivateKeyAccount;
}

/**
 * Configuration for `createBillingClients`.
 * All three fields are required — missing any one will produce a non-functional
 * chain layer. For test harnesses, pass dummy values and substitute mock
 * transports via vitest overrides.
 */
export interface BillingClientsConfig {
  /** RPC URL for the L2 chain where the ClaudeVault is deployed. */
  chainRpcUrl: string;
  /** RPC URL for Ethereum mainnet (used only for TWAP reads). */
  mainnetRpcUrl: string;
  /** Operator private key (hex, 0x-prefixed). Used to sign vault write txs. */
  operatorPrivateKey: Hex;
}

/**
 * Pure factory — creates a `BillingClients` bundle from explicit config.
 *
 * No module-level state, no lazy init, no ES Proxy. Suitable for:
 * - Production: call once in `Plugin.init()`, thread through all chain fns.
 * - Tests: call per-test with mock transports; each test gets isolation.
 *
 * @example
 * ```ts
 * const clients = createBillingClients({
 *   chainRpcUrl: process.env.BILLING_CHAIN_RPC_URL!,
 *   mainnetRpcUrl: process.env.BILLING_MAINNET_RPC_URL!,
 *   operatorPrivateKey: process.env.BILLING_OPERATOR_PRIVATE_KEY as Hex,
 * });
 * ```
 */
export function createBillingClients(cfg: BillingClientsConfig): BillingClients {
  const operatorAccount = privateKeyToAccount(cfg.operatorPrivateKey);

  const publicClient = createPublicClient({
    transport: http(cfg.chainRpcUrl),
  });

  const walletClient = createWalletClient({
    account: operatorAccount,
    transport: http(cfg.chainRpcUrl),
  });

  const mainnetClient = createPublicClient({
    transport: http(cfg.mainnetRpcUrl),
  });

  return { publicClient, walletClient, mainnetClient, operatorAccount };
}

/**
 * v2.0.0: read-only client bundle for the CLI.
 *
 * The CLI never signs chain writes in v2.x — the gateway holds the operator
 * key — so we expose a separate factory that takes neither a private key nor
 * an L2 RPC URL. The only chain interaction the CLI keeps is reading the
 * TWAP oracle off Ethereum mainnet to keep its local /v1/estimate cache warm.
 *
 * Returns a public client for mainnet only. Use with `refreshTwap()` and the
 * TWAP cache.
 */
export function createTwapClient(cfg: { mainnetRpcUrl: string }): PublicClient {
  return createPublicClient({
    transport: http(cfg.mainnetRpcUrl),
  });
}
