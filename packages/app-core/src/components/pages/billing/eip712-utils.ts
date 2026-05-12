/**
 * EIP-712 / EIP-3009 signing utilities for the TopupView.
 *
 * Decision Z41: Use ethers v6 (`signer.signTypedData`) for typed-data signing.
 * Wire-format is compatible with the backend's `verifyEip3009Signature()` (viem).
 */

// ---------------------------------------------------------------------------
// Signature decomposition
// ---------------------------------------------------------------------------

/**
 * Decompose an ethers v6 65-byte hex signature (0x + 130 hex chars) into
 * the `{ v, r, s }` shape that `POST /v1/topup/settle` expects.
 *
 * ethers.signTypedData() returns compact form: r (32 bytes) || s (32 bytes) || v (1 byte).
 */
export function decomposeSignature(hex: string): {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
} {
  if (!hex.startsWith("0x") || hex.length !== 132) {
    throw new Error(
      `Invalid signature: expected 0x-prefixed 65-byte hex (132 chars), got length ${hex.length}`,
    );
  }
  const r = hex.slice(0, 66) as `0x${string}`;
  const s = (`0x` + hex.slice(66, 130)) as `0x${string}`;
  const v = parseInt(hex.slice(130, 132), 16);
  return { v, r, s };
}

// ---------------------------------------------------------------------------
// EIP-3009 typed-data message builder
// ---------------------------------------------------------------------------

export interface TransferWithAuthArgs {
  from: `0x${string}`;
  to: `0x${string}`;
  /** PTON amount in attoPTON (1e18 units) */
  valueAttoPton: bigint;
  validAfterUnix: number;
  validBeforeUnix: number;
  /** 32-byte hex nonce — the topupId UUID converted to bytes32 */
  nonceHex: `0x${string}`;
}

/**
 * Build the `message` object for EIP-3009 `TransferWithAuthorization`.
 *
 * ethers v6 serialises `uint256` fields as strings when they exceed
 * Number.MAX_SAFE_INTEGER — pass `value` as a string to be safe.
 * `validAfter` / `validBefore` are plain numbers (unix timestamps fit in uint32).
 */
export function buildTransferWithAuthMessage(
  args: TransferWithAuthArgs,
): Record<string, unknown> {
  return {
    from: args.from,
    to: args.to,
    value: args.valueAttoPton.toString(), // uint256 → string for ethers
    validAfter: args.validAfterUnix,
    validBefore: args.validBeforeUnix,
    nonce: args.nonceHex,
  };
}

// ---------------------------------------------------------------------------
// Type definitions (matches backend chain/typed-data.ts)
// ---------------------------------------------------------------------------

export const TRANSFER_WITH_AUTHORIZATION_TYPES: Record<
  string,
  { name: string; type: string }[]
> = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

// ---------------------------------------------------------------------------
// UUID → bytes32 conversion (topupId nonce encoding)
// ---------------------------------------------------------------------------

/**
 * Convert a standard UUID string (e.g. "550e8400-e29b-41d4-a716-446655440000")
 * into a 32-byte hex string with 0x prefix, left-padded with zeros.
 *
 * This matches the backend's nonce encoding:
 *   `0x${topupId.replace(/-/g, "").padStart(64, "0")}`
 */
export function topupIdToNonce(topupId: string): `0x${string}` {
  const hex = topupId.replace(/-/g, "").padStart(64, "0");
  return `0x${hex}` as `0x${string}`;
}

// ---------------------------------------------------------------------------
// PTON formatting helper
// ---------------------------------------------------------------------------

/**
 * Format an attoPTON bigint as a human-readable PTON string with 4 decimals.
 * e.g. 1_500_000_000_000_000_000n → "1.5000"
 */
export function formatAttoPton(attoPton: bigint): string {
  const whole = attoPton / BigInt(1e18);
  // Extract fractional part (4 decimal places)
  const fracPart =
    (attoPton - whole * BigInt(1e18)) / BigInt(1e14); // gives 0-9999
  return `${whole.toString()}.${fracPart.toString().padStart(4, "0")}`;
}
