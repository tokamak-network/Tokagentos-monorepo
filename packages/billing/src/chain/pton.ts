import { verifyTypedData, type Address, type Hex } from "viem";
import { TRANSFER_WITH_AUTH_TYPES, ptonDomain } from "./typed-data.js";

export type { Address, Hex };

/**
 * EIP-3009 payment authorization parameters.
 * These fields map directly to the `TransferWithAuthorization` EIP-712 message.
 *
 * Source: llm-api-gateway/proxy/src/onchain.ts (PaymentAuthorization)
 */
export interface PaymentAuthorization {
  /** The authorizer — must match the recovered signer address. */
  from: Address;
  /** The recipient of the transfer (typically the vault contract). */
  to: Address;
  /** Transfer amount in PTON atto-units (1 PTON = 1e27 atto). */
  value: bigint;
  /** Unix timestamp before which the signature is invalid (typically 0). */
  validAfter: bigint;
  /** Unix timestamp after which the signature is invalid (expiry). */
  validBefore: bigint;
  /** Unique bytes32 nonce — prevents replay on-chain. */
  nonce: Hex;
}

/**
 * ECDSA signature components for an EIP-3009 authorization.
 *
 * Source: llm-api-gateway/proxy/src/onchain.ts (PaymentSignature)
 */
export interface PaymentSignature {
  /** Recovery byte (27 or 28; some signers return 0 or 1). */
  v: number;
  /** r component (0x-prefixed, 32 bytes). */
  r: Hex;
  /** s component (0x-prefixed, 32 bytes). */
  s: Hex;
}

/**
 * Off-chain verification of an EIP-3009 TransferWithAuthorization signature
 * against the PTON EIP-712 domain.
 *
 * Returns `true` iff the signature recovers to `auth.from`. No on-chain calls
 * are made — viem's typed-data verification is used (pure cryptographic check).
 *
 * Used by Phase 6 `/v1/topup/settle` handler to gate vault writes: a deposit
 * is only submitted on-chain once the signature is verified to originate from
 * the claimed `from` address.
 *
 * Source: llm-api-gateway/proxy/src/onchain.ts:90-115 (verifyEip3009Signature)
 *
 * @param params.auth - The payment authorization parameters.
 * @param params.sig - The ECDSA signature (r, s, v).
 * @param params.chainId - Chain ID of the PTON deployment (for EIP-712 domain).
 * @param params.ptonAddress - PTON contract address (EIP-712 verifyingContract).
 *
 * @example
 * ```ts
 * const valid = await verifyEip3009Signature({
 *   auth: { from, to, value, validAfter, validBefore, nonce },
 *   sig: { v, r, s },
 *   chainId: 1,
 *   ptonAddress: ETHEREUM_MAINNET.pton!,
 * });
 * if (!valid) return res.status(402).json({ type: 'billing_error', code: 'invalid_signature' });
 * ```
 */
export async function verifyEip3009Signature(params: {
  auth: PaymentAuthorization;
  sig: PaymentSignature;
  chainId: number;
  ptonAddress: Address;
}): Promise<boolean> {
  const { auth, sig, chainId, ptonAddress } = params;

  // Concatenate r + s + v into a single 65-byte hex signature.
  // Source used the same construction (onchain.ts:94).
  const signatureHex = (`0x${sig.r.slice(2)}${sig.s.slice(2)}${sig.v.toString(16).padStart(2, "0")}`) as Hex;

  return await verifyTypedData({
    address: auth.from,
    domain: ptonDomain(chainId, ptonAddress),
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: auth.from,
      to: auth.to,
      value: auth.value,
      validAfter: auth.validAfter,
      validBefore: auth.validBefore,
      nonce: auth.nonce,
    },
    signature: signatureHex,
  });
}
