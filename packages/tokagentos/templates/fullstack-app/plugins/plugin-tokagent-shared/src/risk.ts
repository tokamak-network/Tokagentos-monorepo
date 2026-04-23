/** Maximum ERC-20 approval amount (2^256 - 1). */
export const MAX_APPROVAL = 2n ** 256n - 1n;

/** Default slippage tolerance in basis points (1% = 100 bps). */
export const DEFAULT_SLIPPAGE_BPS = 100;

/** Denominator for basis-point arithmetic. */
export const BPS_DENOMINATOR = 10_000;

/**
 * Apply downward slippage to an amount (e.g. for minAmountOut on withdrawals/swaps).
 * Returns `amount * (10_000 - slippageBps) / 10_000`.
 *
 * @example
 * applySlippageDown(1000n, 100) // → 990n  (1% slippage)
 */
export function applySlippageDown(
  amount: bigint,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS,
): bigint {
  validateSlippageBps(slippageBps);
  return (amount * BigInt(BPS_DENOMINATOR - slippageBps)) / BigInt(BPS_DENOMINATOR);
}

/**
 * Apply upward slippage to an amount (e.g. for maxAmountIn on swaps).
 * Returns `amount * (10_000 + slippageBps) / 10_000`.
 *
 * @example
 * applySlippageUp(1000n, 100) // → 1010n  (1% slippage)
 */
export function applySlippageUp(
  amount: bigint,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS,
): bigint {
  validateSlippageBps(slippageBps);
  return (amount * BigInt(BPS_DENOMINATOR + slippageBps)) / BigInt(BPS_DENOMINATOR);
}

/**
 * Validates that a slippage value is within the accepted range [0, 5000] bps (0–50%).
 * Values above 50% almost certainly indicate a bug (e.g., passing percent instead of bps).
 *
 * @throws if bps is negative or exceeds 5000
 */
export function validateSlippageBps(bps: number): void {
  if (bps < 0 || bps > 5_000) {
    throw new RangeError(
      `slippageBps must be between 0 and 5000 (0%–50%), got ${bps}. ` +
        'If you meant to pass a percentage, multiply by 100 (e.g., 1% → 100 bps).',
    );
  }
}
