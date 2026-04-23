/**
 * perp-funding-arb — detect funding rate spreads across Hyperliquid perps and trade them.
 *
 * evaluate: fully implemented — real HTTP call to HL info endpoint, real spread computation.
 * execute: submits two CoreWriter limit orders (long + short) in one vault.executeBatch call.
 *
 * Prerequisites (documented in README):
 *   1. Deploy TokagentHyperEvmHelper on HyperEVM and set TOKAGENT_HYPERLIQUID_HELPER_ADDRESS.
 *   2. Fund vault with HYPE for HyperCore gas.
 *   3. Register vault as API wallet on Hyperliquid.
 *   4. Seed first position via REST API to initialize leverage > 0.
 *
 * Run in "testing" status to get real evaluate output without any trades being placed.
 */

import { z } from "zod";
import type { StrategyKindImpl } from "../types.js";
import {
  buildLimitOrderCall,
  resolveAssetInfo,
} from "@tokagent/plugin-tokagent-perps";
import {
  TokagentVaultClient,
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
} from "@tokagent/plugin-tokagent-shared";
import { runBacktest } from "../backtest/engine.js";
import { fetchHyperliquidFundingHistory } from "../backtest/data-sources.js";
import type { BacktestContext, BacktestResult, BacktestDataPoint } from "../backtest/types.js";

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

  async execute(params, vault, context, runtime) {
    if (!context || typeof context !== "object") {
      throw new Error("execute called without evaluate context");
    }
    const { longSymbol, shortSymbol } = context as {
      longSymbol: string;
      shortSymbol: string;
    };

    // ── Resolve infrastructure ──────────────────────────────────────────────

    const helperAddr = (
      runtime.getSetting("TOKAGENT_HYPERLIQUID_HELPER_ADDRESS") as string | undefined
    )?.trim();

    const PLACEHOLDER = "0x0000000000000000000000000000000000000000";
    if (!helperAddr || helperAddr === PLACEHOLDER) {
      throw new Error(
        "TokagentHyperEvmHelper is not deployed. " +
          "Deploy contracts/script/deploy/DeployTokagentHyperEvmHelper.s.sol on HyperEVM, " +
          "then set TOKAGENT_HYPERLIQUID_HELPER_ADDRESS in your agent config.",
      );
    }

    const vaultAddress = vault.address;
    const chainId      = vault.chainId; // should be 999 for HyperEVM

    let privateKey: `0x${string}`;
    try {
      // Cast: IAgentRuntime.getSetting returns string|number|boolean|null but
      // AgentRuntimeLike expects string|undefined. The values we care about are strings.
      privateKey = resolveAgentPrivateKey(runtime as unknown as Parameters<typeof resolveAgentPrivateKey>[0]);
    } catch (e) {
      throw new Error(
        `Cannot resolve agent private key: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const apiUrl =
      (runtime.getSetting("HYPERLIQUID_API_URL") as string | undefined) ??
      "https://api.hyperliquid.xyz";

    // ── Fetch asset info for both legs ────────────────────────────────────

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 15_000);

    let longInfo:  { assetIndex: number; szDecimals: number; markPx: number };
    let shortInfo: { assetIndex: number; szDecimals: number; markPx: number };

    try {
      [longInfo, shortInfo] = await Promise.all([
        resolveAssetInfo(longSymbol,  apiUrl, controller.signal),
        resolveAssetInfo(shortSymbol, apiUrl, controller.signal),
      ]);
    } finally {
      clearTimeout(timeout);
    }

    // ── Build both CoreWriter calls ───────────────────────────────────────

    const longCall = buildLimitOrderCall({
      symbol:       longSymbol,
      side:         "long",
      sizeUsd:      params.maxPositionUsd,
      markPx:       longInfo.markPx,
      assetIndex:   longInfo.assetIndex,
      szDecimals:   longInfo.szDecimals,
      helperAddress: helperAddr,
    });

    const shortCall = buildLimitOrderCall({
      symbol:       shortSymbol,
      side:         "short",
      sizeUsd:      params.maxPositionUsd,
      markPx:       shortInfo.markPx,
      assetIndex:   shortInfo.assetIndex,
      szDecimals:   shortInfo.szDecimals,
      helperAddress: helperAddr,
    });

    // ── Submit both legs in one executeBatch (atomic from vault POV) ──────

    const publicClient = getPublicClient(chainId);
    const walletClient = getWalletClient(chainId, privateKey);
    const client       = new TokagentVaultClient(vaultAddress, publicClient, walletClient);

    const txHash = await client.executeBatch([longCall, shortCall]);

    return {
      summary:
        `Opened ${longSymbol} long + ${shortSymbol} short at ` +
        `$${params.maxPositionUsd} per leg. Tx: ${txHash}`,
      txHashes: [txHash as `0x${string}`],
    };
  },

  async backtest(
    params: Params,
    ctx: BacktestContext,
    _vault: { chainId: number; address: `0x${string}` },
  ): Promise<BacktestResult> {
    // Fetch funding history for each symbol
    const series = await Promise.all(
      params.symbols.map((s) =>
        fetchHyperliquidFundingHistory(s, ctx.fromMs, ctx.toMs).then((data) => ({
          symbol: s,
          data,
        })),
      ),
    );

    // Check for insufficient data
    const insufficient = series.find((s) => s.data.length < 2);
    if (insufficient) {
      return {
        supported: true,
        run: {
          runAt: Date.now(),
          rangeFromMs: ctx.fromMs,
          rangeToMs: ctx.toMs,
          totalTicks: 0,
          signalCount: 0,
          pnlPctHypothetical: 0,
          sharpeHypothetical: 0,
          maxDrawdownPct: 0,
          summary: `Insufficient funding history for ${insufficient.symbol}`,
          warnings: [
            `fewer than 2 datapoints for ${insufficient.symbol} — try a longer range`,
          ],
        },
      };
    }

    // Merge all series into a unified timeline.
    // For each data point from any series, emit a composite BacktestDataPoint
    // that carries the last-known funding for ALL symbols.
    // We iterate over all timestamps and maintain a running "last known" per symbol.
    const allTimestamps = Array.from(
      new Set(series.flatMap((s) => s.data.map((p) => p.ts))),
    ).sort((a, b) => a - b);

    // lastKnown[symbol] = last known funding rate before/at current timestamp
    const lastKnown: Record<string, number> = {};
    const allPoints: BacktestDataPoint[] = [];

    for (const ts of allTimestamps) {
      // Update lastKnown for any series that has a point at this ts
      for (const { symbol, data } of series) {
        const point = data.find((p) => p.ts === ts);
        if (point) {
          lastKnown[symbol] = Number(point.funding ?? 0);
        }
      }
      // Only emit a composite point once we have at least one reading per symbol
      if (Object.keys(lastKnown).length === params.symbols.length) {
        const composite: BacktestDataPoint = { ts };
        for (const sym of params.symbols) {
          composite[`funding_${sym}`] = lastKnown[sym] ?? 0;
        }
        allPoints.push(composite);
      }
    }

    const hourMs = 3600 * 1000;

    const run = runBacktest({
      rangeFromMs: ctx.fromMs,
      rangeToMs: ctx.toMs,
      stepMs: ctx.stepMs,
      dataPoints: allPoints,
      evaluator: (_tickTs, recent) => {
        const latest = recent[recent.length - 1];
        if (!latest) return { shouldExecute: false, pnlDelta: 0 };
        const fundings = params.symbols.map((s) => Number(latest[`funding_${s}`] ?? 0));
        const max = Math.max(...fundings);
        const min = Math.min(...fundings);
        const spreadBps = Math.round((max - min) * 10_000);
        if (spreadBps < params.minFundingSpreadBps) {
          return { shouldExecute: false, pnlDelta: 0 };
        }
        // Per-tick P&L proxy: spread × stepMs/hourMs
        // (funding rate is quoted per hour; stepMs/hourMs = fraction of hour per tick)
        const pnlDelta = (max - min) * (ctx.stepMs / hourMs);
        return { shouldExecute: true, pnlDelta };
      },
    });

    run.warnings.push(
      "Backtest ignores slippage, fees, borrow cost.",
      "Assumes 1-tick holding period — real holding is determined by execution + spread convergence.",
      "Uses current funding spread as P&L proxy; actual P&L depends on position size, mark price drift, and funding payment timing.",
      "Hyperliquid funding is hourly; sub-hourly steps interpolate with the last known rate.",
    );

    return { supported: true, run };
  },
};
