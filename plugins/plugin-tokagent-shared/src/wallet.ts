import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getChainConfig } from './chain-config.js';

/**
 * Minimal interface for elizaOS agent runtime.
 * Using a local interface avoids a hard dependency on @elizaos/core while
 * remaining fully compatible with it.
 */
export interface AgentRuntimeLike {
  getSetting(key: string): string | undefined;
}

/**
 * Creates a viem PublicClient for the given chain.
 * Uses the chain's default RPC unless overridden.
 */
export function getPublicClient(chainId: number, rpcOverride?: string): PublicClient {
  const config = getChainConfig(chainId);
  const rpcUrl = rpcOverride ?? config.defaultRpc;
  return createPublicClient({
    transport: http(rpcUrl),
  }) as PublicClient;
}

/**
 * Creates a viem WalletClient for the given chain and private key.
 * Uses the chain's default RPC unless overridden.
 */
export function getWalletClient(
  chainId: number,
  privateKey: Hex,
  rpcOverride?: string,
): WalletClient {
  const config = getChainConfig(chainId);
  const rpcUrl = rpcOverride ?? config.defaultRpc;
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    transport: http(rpcUrl),
  }) as WalletClient;
}

/**
 * Reads TOKAGENT_PRIVATE_KEY from elizaOS agent runtime settings.
 * Validates that it is a 0x-prefixed 32-byte hex string (64 hex chars after 0x).
 * Throws a clear error if missing or malformed.
 */
export function resolveAgentPrivateKey(runtime: AgentRuntimeLike): Hex {
  const raw = runtime.getSetting('TOKAGENT_PRIVATE_KEY');
  if (!raw) {
    throw new Error(
      'TOKAGENT_PRIVATE_KEY is not set. Add it to your agent configuration or .env file.',
    );
  }
  if (!isHex(raw)) {
    throw new Error(
      'TOKAGENT_PRIVATE_KEY must be a 0x-prefixed hex string (e.g. 0xabc123...).',
    );
  }
  // Strip the 0x prefix to count raw hex chars; a 32-byte key = 64 hex chars
  const hexBody = raw.slice(2);
  if (hexBody.length !== 64) {
    throw new Error(
      `TOKAGENT_PRIVATE_KEY must be exactly 32 bytes (64 hex chars after 0x), got ${hexBody.length} chars.`,
    );
  }
  return raw as Hex;
}
