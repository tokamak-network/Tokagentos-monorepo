import type { TypedDataDomain } from "viem";

/**
 * EIP-712 typed data for EIP-3009 TransferWithAuthorization (PTON).
 *
 * The domain (name="PTON", version="1") is constructed at call time using the
 * configured chainId and PTON contract address. See `ptonDomain()` below.
 *
 * Source: llm-api-gateway/proxy/src/abi.ts (TRANSFER_WITH_AUTH_TYPES)
 * Extracted from chain/abi/pton.ts in Phase 3 (Decision Z8) — EIP-712
 * typed-data constants are domain shape data, not ABI fragments.
 */
export const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * EIP-712 typed data for the proxy's SIWE-style login signature.
 *
 * Domain: { name: "ai-proxy", version: "1", chainId } — no verifyingContract
 * because this signature has no on-chain meaning (pure off-chain auth).
 *
 * Source: llm-api-gateway/proxy/src/abi.ts (LOGIN_AUTH_TYPES)
 * Note: Phase 6 (auth routes) consumes this; Phase 3 only relocates it for
 * boundary cleanliness (EIP-712 typed-data is not an ABI fragment).
 */
export const LOGIN_AUTH_TYPES = {
  LoginAuth: [
    { name: "wallet", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

/**
 * Constructs the EIP-712 domain for PTON TransferWithAuthorization signatures.
 *
 * @param chainId - The chain ID where the PTON contract is deployed.
 * @param ptonAddress - The PTON contract's deployed address (verifyingContract).
 */
export function ptonDomain(
  chainId: number,
  ptonAddress: `0x${string}`,
): TypedDataDomain {
  return {
    name: "PTON",
    version: "1",
    chainId,
    verifyingContract: ptonAddress,
  };
}

/**
 * Constructs the EIP-712 domain for the proxy's wallet-auth login signature.
 * No `verifyingContract` — this signature has no on-chain meaning.
 *
 * @param chainId - The chain ID used to prevent cross-chain replay.
 */
export function loginAuthDomain(chainId: number): TypedDataDomain {
  return {
    name: "ai-proxy",
    version: "1",
    chainId,
  };
}
