import type { BacktestDataPoint } from "./types.js";

const FETCH_TIMEOUT_MS = 10_000;

// ─── Hyperliquid ──────────────────────────────────────────────────────────────

/**
 * Fetch Hyperliquid historical funding rates for a symbol.
 * Returns: [{ ts: number, funding: number }...] sorted ascending.
 */
export async function fetchHyperliquidFundingHistory(
  symbol: string,
  fromMs: number,
  toMs: number,
): Promise<BacktestDataPoint[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "fundingHistory",
        coin: symbol,
        startTime: fromMs,
        endTime: toMs,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`hyperliquid fundingHistory failed: ${res.status}`);
  }

  const json = (await res.json()) as Array<{ time: number; fundingRate: string }>;
  if (!Array.isArray(json)) {
    throw new Error("hyperliquid fundingHistory: unexpected response shape");
  }

  return json
    .map((r) => ({ ts: r.time, funding: parseFloat(r.fundingRate) }))
    .sort((a, b) => a.ts - b.ts);
}

// ─── Aave v3 Polygon ──────────────────────────────────────────────────────────

/**
 * Fetch Aave v3 Polygon reserve APY history for an asset.
 * Returns: [{ ts: number, liquidityRate: number }...] where liquidityRate is
 *   the supply APY as a fraction (0.045 = 4.5%).
 * The subgraph returns liquidityRate in ray (1e27). This function converts to fraction.
 */
export async function fetchAaveRateHistory(
  reserveId: string,   // lowercase reserve address on Polygon
  fromMs: number,
  toMs: number,
): Promise<BacktestDataPoint[]> {
  const fromSec = Math.floor(fromMs / 1000);
  const toSec = Math.floor(toMs / 1000);

  const query = `{
    reserveParamsHistoryItems(
      first: 1000,
      where: { reserve: "${reserveId}", timestamp_gt: ${fromSec}, timestamp_lt: ${toSec} },
      orderBy: timestamp, orderDirection: asc
    ) {
      timestamp
      liquidityRate
    }
  }`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(
      "https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`aave subgraph failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: {
      reserveParamsHistoryItems: Array<{
        timestamp: number;
        liquidityRate: string;
      }>;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(`aave subgraph returned errors: ${JSON.stringify(json.errors)}`);
  }

  const items = json.data?.reserveParamsHistoryItems ?? [];

  // Aave liquidityRate is in ray (1e27). Convert to fraction.
  return items.map((i) => ({
    ts: i.timestamp * 1000,
    liquidityRate: parseFloat(i.liquidityRate) / 1e27,
  }));
}
