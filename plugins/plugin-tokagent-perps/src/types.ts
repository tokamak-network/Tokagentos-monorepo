/** Default Hyperliquid API base URL */
export const DEFAULT_HL_API_URL = 'https://api.hyperliquid.xyz';

/** Fetch timeout for all Hyperliquid API calls */
export const HL_FETCH_TIMEOUT_MS = 10_000;

/** A single open perpetual position returned by clearinghouseState */
export interface HyperliquidPosition {
  coin: string;
  szi: string;          // position size (positive = long, negative = short)
  entryPx: string;      // average entry price
  unrealizedPnl: string;
  liquidationPx: string | null;
}

/** Parsed clearinghouseState response */
export interface ClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
  };
  assetPositions: Array<{
    position: HyperliquidPosition;
  }>;
}

/** One entry from metaAndAssetCtxs */
export interface AssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  markPx: string;
  midPx: string | null;
}

/** Market info returned by the action */
export interface PerpsMarketInfo {
  symbol: string;
  mark: number;
  funding: number;   // per hour, as decimal (e.g. 0.0001 = 0.01%/hr)
  volume24h: number; // in USD millions
}
