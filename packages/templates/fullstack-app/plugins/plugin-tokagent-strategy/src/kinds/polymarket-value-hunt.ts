/**
 * polymarket-value-hunt — scan Polymarket for mispriced binary markets.
 *
 * Alert-only: evaluate() returns shouldExecute: false always.
 * The tick summary IS the alert — flagged markets appear in tickHistory.
 * execute() throws clearly if called.
 */

import { z } from "zod";
import type { StrategyKindImpl } from "../types.js";

// ─── Param schema ─────────────────────────────────────────────────────────────

export const polymarketValueHuntParamSchema = z.object({
  minMarketVolume: z.number().positive(),
  minMispricingPct: z.number().positive(),
  maxMarkets: z.number().int().positive().max(20),
});

type Params = z.infer<typeof polymarketValueHuntParamSchema>;

// ─── Gamma API types ──────────────────────────────────────────────────────────

interface GammaMarket {
  id?: string;
  question?: string;
  slug?: string;
  /** Cumulative USD volume */
  volume?: string | number;
  /** Best bid for YES token */
  bestBid?: string | number;
  /** Best ask for YES token */
  bestAsk?: string | number;
  /** Last trade price for YES token */
  lastTradePrice?: string | number;
  active?: boolean;
  closed?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | undefined): number {
  if (v === undefined || v === null) return 0;
  return typeof v === "string" ? Number.parseFloat(v) : v;
}

interface FlaggedMarket {
  id: string;
  question: string;
  spreadPct: number;
  bestBid: number;
  bestAsk: number;
  midpoint: number;
  lastTradePrice: number;
  reason: string;
}

// ─── Implementation ──────────────────────────────────────────────────────────

export const polymarketValueHuntKind: StrategyKindImpl<Params> = {
  kind: "polymarket-value-hunt",
  paramSchema: polymarketValueHuntParamSchema,

  async evaluate(params, _vault, _runtime) {
    const url =
      `https://gamma-api.polymarket.com/markets` +
      `?active=true&closed=false&volume_min=${params.minMarketVolume}&limit=${params.maxMarkets}`;

    let markets: GammaMarket[] = [];
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "tokagent-strategy/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const data = await resp.json();
      markets = Array.isArray(data) ? data : (data as { markets?: GammaMarket[] }).markets ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        shouldExecute: false,
        summary: `polymarket-value-hunt: failed to fetch markets — ${msg}`,
        context: { error: msg, flaggedMarkets: [] },
      };
    }

    const flagged: FlaggedMarket[] = [];

    for (const m of markets) {
      const bestBid = toNum(m.bestBid);
      const bestAsk = toNum(m.bestAsk);
      const lastTradePrice = toNum(m.lastTradePrice);

      // Skip markets with no bid/ask data
      if (bestBid <= 0 || bestAsk <= 0 || bestAsk <= bestBid) continue;

      const midpoint = (bestBid + bestAsk) / 2;
      const spreadPct = ((bestAsk - bestBid) / midpoint) * 100;

      let flagReason: string | null = null;

      if (spreadPct > params.minMispricingPct) {
        flagReason = `wide spread ${spreadPct.toFixed(1)}% > threshold ${params.minMispricingPct}%`;
      } else if (
        lastTradePrice > 0 &&
        Math.abs(lastTradePrice - midpoint) / midpoint * 100 > params.minMispricingPct
      ) {
        const drift = ((lastTradePrice - midpoint) / midpoint) * 100;
        flagReason = `last price ${lastTradePrice.toFixed(3)} drifted ${drift > 0 ? "+" : ""}${drift.toFixed(1)}% from midpoint ${midpoint.toFixed(3)}`;
      }

      if (flagReason) {
        flagged.push({
          id: m.id ?? "unknown",
          question: m.question ?? m.slug ?? "Unknown market",
          spreadPct,
          bestBid,
          bestAsk,
          midpoint,
          lastTradePrice,
          reason: flagReason,
        });
      }
    }

    // Build summary (cap at 5 for readability)
    const display = flagged.slice(0, 5);
    let summary: string;
    if (flagged.length === 0) {
      summary = `Scanned ${markets.length} markets (volume ≥ $${params.minMarketVolume}); no markets flagged as mispriced (threshold: ${params.minMispricingPct}% spread or drift).`;
    } else {
      const lines = display.map(
        (f) => `  • "${f.question.slice(0, 70)}" — ${f.reason}`,
      );
      summary =
        `Scanned ${markets.length} markets; flagged ${flagged.length} as mispriced (threshold: ${params.minMispricingPct}%):\n` +
        lines.join("\n") +
        (flagged.length > 5 ? `\n  … and ${flagged.length - 5} more.` : "");
    }

    return {
      shouldExecute: false,
      summary,
      context: {
        scannedCount: markets.length,
        flaggedMarkets: flagged,
      },
    };
  },

  async execute(_params, _vault, _context, _runtime) {
    throw new Error(
      "polymarket-value-hunt is alert-only; execute should not be called. " +
        "The strategy's shouldExecute is always false — the evaluate summary IS the output.",
    );
  },
};
