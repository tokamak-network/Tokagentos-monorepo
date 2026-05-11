/**
 * USD → atto-PTON conversion and per-call charge split.
 *
 * In credit mode the proxy's job is just "given an actual USD spend, return
 * the atto-PTON amount to debit (cost + operator margin)". The operator
 * margin is applied in atto-PTON space (bigint), not in USD space, so
 * sub-micro-USD fees don't collapse into the 1-micro-USD floor that
 * Math.ceil(usd * 1e6) imposes inside usdToPton.
 */

export function usdToPton(usd: number, tonUsd: number): bigint {
  if (usd <= 0) return 0n;
  if (!(tonUsd > 0) || !Number.isFinite(tonUsd)) {
    throw new Error(`invalid TON/USD price: ${tonUsd}`);
  }
  // Scale via micro-USD before going to BigInt so float64 keeps full precision
  // even for large quotes (Math.ceil(usd * 1e18) loses precision past ~$10).
  const usdMicro = BigInt(Math.ceil(usd * 1_000_000));
  const tonUsdMicro = BigInt(Math.round(tonUsd * 1_000_000));
  // amountPton[atto] = (usd / tonUsd) * 1e18 = (usdMicro * 1e18) / tonUsdMicro
  // ceil-divide to avoid under-billing by sub-wei rounding.
  const numerator = usdMicro * 10n ** 18n;
  return (numerator + tonUsdMicro - 1n) / tonUsdMicro;
}

export interface ChargeSplit {
  actualPton: bigint;
  feePton: bigint;
  totalPton: bigint;
}

/**
 * Return the per-call charge components in atto-PTON.
 *
 *   actualPton = usdToPton(actualUsd, tonUsdNow)
 *   feePton    = actualPton * marginBps / 10000   (bigint truncation; ≤1 atto loss)
 *   totalPton  = actualPton + feePton             (= what the ledger will accrue)
 *
 * Margin is applied in atto-PTON space (bigint ratio) so sub-micro-USD spends
 * don't get inflated by USD-space ceil rounding (regression covered by tests).
 */
export function computeCharge(params: {
  actualUsd: number;
  tonUsd: number;
  marginBps: number;
}): ChargeSplit {
  const actualPton = usdToPton(params.actualUsd, params.tonUsd);
  const feePton = (actualPton * BigInt(params.marginBps)) / 10_000n;
  const totalPton = actualPton + feePton;
  return { actualPton, feePton, totalPton };
}

/**
 * Walk the request looking for `cache_control` blocks with `ttl: "5m"` or
 * `ttl: "1h"`. Returns `{ hasCacheControl: false }` when none are found, or
 * `{ hasCacheControl: true, cacheTtl: "5m" | "1h" }` when at least one is
 * present. The `"1h"` variant dominates — if the request contains both `"5m"`
 * and `"1h"` markers, we report `"1h"` so the billing code charges the higher
 * write rate and avoids under-billing.
 *
 * Input type is `unknown` so this helper can be called at any point in the
 * request pipeline before schema validation, keeping the billing layer
 * independent of the route-layer schema.
 */
export function detectCacheControl(
  request: unknown,
): { hasCacheControl: false } | { hasCacheControl: true; cacheTtl: "5m" | "1h" } {
  let has = false;
  let oneHour = false;

  const visit = (v: unknown): void => {
    if (oneHour || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) {
        visit(x);
        if (oneHour) return;
      }
      return;
    }
    const o = v as Record<string, unknown>;
    const cc = o.cache_control;
    if (cc !== undefined && cc !== null && typeof cc === "object") {
      has = true;
      if ((cc as { ttl?: unknown }).ttl === "1h") {
        oneHour = true;
        return;
      }
    }
    for (const k in o) {
      visit(o[k]);
      if (oneHour) return;
    }
  };

  visit(request);

  if (!has) return { hasCacheControl: false };
  return { hasCacheControl: true, cacheTtl: oneHour ? "1h" : "5m" };
}
