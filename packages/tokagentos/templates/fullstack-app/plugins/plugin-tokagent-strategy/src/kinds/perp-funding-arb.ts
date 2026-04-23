/**
 * perp-funding-arb — detect funding rate spreads across Hyperliquid perps.
 *
 * evaluate: fully implemented — real HTTP call to HL info endpoint, real spread computation.
 * execute: stub — throws a clear error with the missing-capability explanation.
 *
 * Run in "testing" status to get real evaluate output without any trades being placed.
 */

import { z } from "zod";
import type { StrategyKindImpl } from "../types.js";

// ─── Param schema ─────────────────────────────────────────────────────────────

export const perpFundingArbParamSchema = z.object({
  symbols: z.array(z.string()).min(2).max(10),
  minFundingSpreadBps: z.number().positive(),
  maxPositionUsd: z.number().positive(),
});

type Params = z.infer<typeof perpFundingArbParamSchema>;

// ─── Hyperliquid API types ────────────────────────────────────────────────────

interface HLAssetCtx {
  funding: string;         // e.g. "0.0000125" — hourly rate as decimal fraction
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
  impactPxs: [string, string] | null;
}

interface HLMeta {
  universe: Array<{ name: string; szDecimals: number }>;
}

interface HLMetaAndAssetCtxsResponse {
  [0]: HLMeta;
  [1]: HLAssetCtx[];
}

// ─── Implementation ──────────────────────────────────────────────────────────

export const perpFundingArbKind: StrategyKindImpl<Params> = {
  kind: "perp-funding-arb",
  paramSchema: perpFundingArbParamSchema,

  async evaluate(params, _vault, _runtime) {
    const resp = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      throw new Error(`Hyperliquid API error: HTTP ${resp.status}`);
    }

    const raw = (await resp.json()) as HLMetaAndAssetCtxsResponse;
    const [meta, assetCtxs] = [raw[0], raw[1]];

    if (!meta?.universe || !Array.isArray(assetCtxs)) {
      throw new Error("Unexpected Hyperliquid API response structure");
    }

    // Build symbol → funding map
    const fundingRates: Record<string, number> = {};
    for (let i = 0; i < meta.universe.length; i++) {
      const sym = meta.universe[i].name;
      if (params.symbols.includes(sym)) {
        const ctx = assetCtxs[i];
        if (ctx?.funding) {
          fundingRates[sym] = Number.parseFloat(ctx.funding);
        }
      }
    }

    const found = Object.keys(fundingRates);
    const missing = params.symbols.filter((s) => !found.includes(s));
    if (missing.length > 0) {
      const missingList = missing.join(", ");
      throw new Error(`Symbols not found on Hyperliquid: ${missingList}`);
    }

    // Compute spread
    const entries = Object.entries(fundingRates) as [string, number][];
    entries.sort((a, b) => b[1] - a[1]);

    const [highSym, highRate] = entries[0];
    const [lowSym, lowRate] = entries[entries.length - 1];
    const spreadFraction = highRate - lowRate;
    const spreadBps = Math.round(spreadFraction * 10_000);

    // Build human-readable rates line
    const ratesLine = entries
      .map(([sym, r]) => `${sym} ${(r * 100).toFixed(4)}%/hr`)
      .join(", ");

    const thresholdBps = params.minFundingSpreadBps;

    if (spreadBps >= thresholdBps) {
      return {
        shouldExecute: true,
        summary:
          `Funding spread ${spreadBps}bps ≥ threshold ${thresholdBps}bps. ` +
          `Long ${lowSym} (${(lowRate * 100).toFixed(4)}%/hr), Short ${highSym} (${(highRate * 100).toFixed(4)}%/hr). ` +
          `Rates: ${ratesLine}.`,
        context: {
          longSymbol: lowSym,
          shortSymbol: highSym,
          spreadBps,
          fundingRates,
          maxPositionUsd: params.maxPositionUsd,
        },
      };
    }

    return {
      shouldExecute: false,
      summary:
        `${ratesLine} — max spread ${spreadBps}bps below threshold ${thresholdBps}bps. No trade.`,
      context: { spreadBps, fundingRates },
    };
  },

  async execute(_params, _vault, _context, _runtime) {
    throw new Error(
      "perp-funding-arb execute() not yet implemented — requires HyperliquidAdapter integration " +
        "with TokagentVault. In 'testing' mode the evaluate step runs but no positions are opened. " +
        "File a follow-up PR to implement perp writes through the vault.",
    );
  },
};
