/** Default Polymarket API base URLs */
export const DEFAULT_GAMMA_URL = 'https://gamma-api.polymarket.com';
export const DEFAULT_DATA_URL = 'https://data-api.polymarket.com';

/** Fetch timeout for all Polymarket API calls */
export const PM_FETCH_TIMEOUT_MS = 10_000;

/** Condition ID pattern — 0x followed by exactly 64 hex chars */
export const CONDITION_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** One outcome in a Polymarket market */
export interface MarketOutcome {
  title: string;
  price: number; // probability as decimal (0..1)
}

/** A Polymarket market object from the gamma API */
export interface PolymarketMarket {
  conditionId: string;
  question: string;
  slug: string;
  liquidity: number;
  volume: number;
  endDate: string;
  outcomes?: string;     // JSON-stringified array of outcome names from gamma API
  outcomePrices?: string; // JSON-stringified array of prices from gamma API
  active?: boolean;
  closed?: boolean;
}

/** A position from the data API */
export interface PolymarketPosition {
  conditionId: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  title: string;
  slug: string;
}
