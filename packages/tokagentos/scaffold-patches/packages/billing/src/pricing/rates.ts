// Model pricing table.
// Sources:
//   - Claude:   https://platform.claude.com/docs/en/about-claude/pricing
//               (last verified 2026-04-20)
//   - OpenAI:   https://developers.openai.com/api/docs/pricing
//               (last verified 2026-04-25)
//   - Gemini:   https://ai.google.dev/gemini-api/docs/pricing
//               (last verified 2026-04-25)
// Unit: USD per 1,000,000 tokens.
//
// Schema note: the `cacheWrite5m` / `cacheWrite1h` fields are Anthropic-shaped —
// Anthropic charges a *premium* on the first write of a cached prompt (125% or
// 200% of base input) and a discount on reads. OpenAI and Gemini both publish
// only a discounted "cached input" rate and charge normal input on writes, so
// for those providers `cacheWrite5m = cacheWrite1h = input` (no premium) and
// `cacheRead` holds the vendor's published cached-input rate. This keeps the
// billing path uniform without fictionalising cache economics that vendors do
// not actually bill.
export interface ModelRates {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

export const PRICING: Record<string, ModelRates> = {
  // ---- Anthropic (cacheWrite = input × 1.25 / 2.0, cacheRead = input × 0.1) ----
  "claude-opus-4-7":   { input:  5.00, cacheWrite5m:  6.25, cacheWrite1h: 10.00, cacheRead: 0.50, output: 25.00 },
  "claude-opus-4-6":   { input:  5.00, cacheWrite5m:  6.25, cacheWrite1h: 10.00, cacheRead: 0.50, output: 25.00 },
  "claude-opus-4-5":   { input:  5.00, cacheWrite5m:  6.25, cacheWrite1h: 10.00, cacheRead: 0.50, output: 25.00 },
  "claude-opus-4-1":   { input: 15.00, cacheWrite5m: 18.75, cacheWrite1h: 30.00, cacheRead: 1.50, output: 75.00 },
  "claude-opus-4":     { input: 15.00, cacheWrite5m: 18.75, cacheWrite1h: 30.00, cacheRead: 1.50, output: 75.00 },
  "claude-sonnet-4-6": { input:  3.00, cacheWrite5m:  3.75, cacheWrite1h:  6.00, cacheRead: 0.30, output: 15.00 },
  "claude-sonnet-4-5": { input:  3.00, cacheWrite5m:  3.75, cacheWrite1h:  6.00, cacheRead: 0.30, output: 15.00 },
  "claude-sonnet-4":   { input:  3.00, cacheWrite5m:  3.75, cacheWrite1h:  6.00, cacheRead: 0.30, output: 15.00 },
  "claude-haiku-4-5":  { input:  1.00, cacheWrite5m:  1.25, cacheWrite1h:  2.00, cacheRead: 0.10, output:  5.00 },
  "claude-haiku-3-5":  { input:  0.80, cacheWrite5m:  1.00, cacheWrite1h:  1.60, cacheRead: 0.08, output:  4.00 },
  "claude-haiku-3":    { input:  0.25, cacheWrite5m:  0.30, cacheWrite1h:  0.50, cacheRead: 0.03, output:  1.25 },
  // Test-only entry: GLM-4.7 priced identically to claude-haiku-3-5 so the
  // billing path can be exercised without negotiating real GLM rates.
  "glm-4.7":           { input:  0.80, cacheWrite5m:  1.00, cacheWrite1h:  1.60, cacheRead: 0.08, output:  4.00 },

  // ---- OpenAI GPT-5.4 family (cacheWrite = input; cacheRead = published cached-input) ----
  "gpt-5.4":           { input:  2.50, cacheWrite5m:  2.50, cacheWrite1h:  2.50, cacheRead: 0.25,   output: 15.00 },
  "gpt-5.4-mini":      { input:  0.75, cacheWrite5m:  0.75, cacheWrite1h:  0.75, cacheRead: 0.075,  output:  4.50 },
  "gpt-5.4-nano":      { input:  0.20, cacheWrite5m:  0.20, cacheWrite1h:  0.20, cacheRead: 0.02,   output:  1.25 },

  // ---- Google Gemini 2.5 (standard tier, prompts ≤ 200k tokens) ----
  // Gemini tiers a surcharge above 200k tokens; we encode the ≤200k rate and
  // guard against long prompts at the request boundary rather than here.
  "gemini-2.5-pro":    { input:  1.25, cacheWrite5m:  1.25, cacheWrite1h:  1.25, cacheRead: 0.125,  output: 10.00 },
  "gemini-2.5-flash":  { input:  0.30, cacheWrite5m:  0.30, cacheWrite1h:  0.30, cacheRead: 0.03,   output:  2.50 },
};

// Allowlist — anything outside this is rejected before a quote is issued.
// Adding a model here commits the proxy to billing it; actual upstream routing
// for OpenAI / Gemini ids is handled by the LiteLLM `model_list` config on the
// api.tokamak.network deployment, which is managed out-of-band.
/**
 * Ordered list form of the allowlist — used by /v1/models so clients see a
 * stable order. The Set form below is what assertSupportedModel checks
 * against; both must stay in sync.
 */
export const SUPPORTED_MODELS_ARR: ReadonlyArray<string> = [
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-haiku-3-5",
  "glm-4.7",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];

export const SUPPORTED_MODELS = new Set<string>(SUPPORTED_MODELS_ARR);

export class UnsupportedModelError extends Error {
  constructor(model: string) {
    super(`Model '${model}' not supported. Allowed: ${[...SUPPORTED_MODELS].join(", ")}`);
    this.name = "UnsupportedModelError";
  }
}

export class DisallowedModifierError extends Error {
  constructor(reason: string) {
    super(`Disallowed request modifier: ${reason}`);
    this.name = "DisallowedModifierError";
  }
}

/**
 * Normalize an Anthropic model id to its base form for pricing lookup.
 *
 * Claude Code (and the anthropic-sdk in general) often sends ids with a
 * date stamp (`-20251022`) or a `-latest` suffix; the pricing table is
 * keyed on the base id. Stripping these here lets the rest of the proxy
 * keep one canonical identifier without forcing the allowlist to enumerate
 * every dated variant.
 *
 *   claude-opus-4-7-20251022 -> claude-opus-4-7
 *   claude-haiku-4-5-latest  -> claude-haiku-4-5
 */
export function normalizeModelId(model: string): string {
  let s = (model ?? "").trim();
  if (s.endsWith("-latest")) s = s.slice(0, -"-latest".length);
  s = s.replace(/-\d{8}$/, "");
  return s;
}

export function getRates(model: string): ModelRates {
  const rates = PRICING[normalizeModelId(model)];
  if (!rates) throw new UnsupportedModelError(model);
  return rates;
}

export function assertSupportedModel(model: string): void {
  if (!SUPPORTED_MODELS.has(normalizeModelId(model))) throw new UnsupportedModelError(model);
}

/**
 * Reject request-level modifiers the MVP doesn't price (batch API, fast mode,
 * data residency). These have their own multipliers in the official table and
 * we refuse them cleanly rather than silently under-charging.
 */
export function assertNoDisallowedModifiers(req: {
  model?: string;
  metadata?: Record<string, unknown>;
  inference_geo?: string;
  [k: string]: unknown;
}): void {
  if ((req as { batch?: unknown }).batch) throw new DisallowedModifierError("batch");
  if ((req as { fast?: unknown }).fast) throw new DisallowedModifierError("fast mode");
  if (req.inference_geo) throw new DisallowedModifierError("inference_geo");
  const meta = req.metadata;
  if (meta && typeof meta === "object") {
    if ("inference_geo" in meta) throw new DisallowedModifierError("inference_geo in metadata");
  }
}

/**
 * Conservative upper bound: assume every input token is charged at base input
 * rate (or at cache-write rate if cache_control present). We never know ahead
 * of time how many tokens will hit cache, so the quote must cover the worst
 * case to avoid under-charging.
 */
export function estimateMaxCostUsd(params: {
  model: string;
  inputTokens: number;
  maxOutputTokens: number;
  hasCacheControl: boolean;
  cacheTtl?: "5m" | "1h";
}): number {
  const r = getRates(params.model);
  let inputRate = r.input;
  if (params.hasCacheControl) {
    inputRate = params.cacheTtl === "1h" ? r.cacheWrite1h : r.cacheWrite5m;
  }
  const inputUsd = (params.inputTokens * inputRate) / 1_000_000;
  const outputUsd = (params.maxOutputTokens * r.output) / 1_000_000;
  return inputUsd + outputUsd;
}
