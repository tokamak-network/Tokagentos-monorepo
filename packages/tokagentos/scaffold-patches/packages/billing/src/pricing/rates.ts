// Model pricing table.
//
// Sources & last-verified dates per provider:
//   - Anthropic Claude:   https://platform.claude.com/docs/en/about-claude/pricing
//                         (last verified 2026-04-20)
//   - OpenAI GPT-5.4:     https://developers.openai.com/api/docs/pricing
//                         (last verified 2026-04-25)
//   - Google Gemini 2.5:  https://ai.google.dev/gemini-api/docs/pricing
//                         (last verified 2026-04-25)
//
// 2026-05-16 update: Tokamak's LiteLLM upstream (api.ai.tokamak.network)
// rotated to a different model lineup — see https://api.ai.tokamak.network/v1/models.
// Added pricing for the new lineup (gpt-5.2 family, gemini-3 family, grok-4-1,
// deepseek, minimax, qwen3, perplexity sonar, cerebras/zai-glm-4.7) using
// best-known public rates at time of addition. The 100 bps default operator
// margin absorbs minor inaccuracies; refine specific rates from production
// usage logs if needed. Image models (flux-2-dev, gemini-2.5-flash-image, sdxl)
// are intentionally NOT priced here because they're per-image, not per-token,
// and the billing engine is token-based.
//
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

  // ===========================================================================
  // 2026-05-16 — LiteLLM-served lineup (api.ai.tokamak.network)
  // ===========================================================================
  // Rates are best-known public figures at the time of addition. Operators
  // should verify against vendor pricing pages before going live with
  // high-volume traffic. Cache columns follow each vendor's convention:
  //   - OpenAI / Google / xAI / DeepSeek / MiniMax / Qwen / Perplexity:
  //     no cache-write premium; cacheWrite5m = cacheWrite1h = input;
  //     cacheRead = published cached-input discount (defaults to 0.1× input).
  //   - Cerebras serves the same GLM model so we mirror glm-4.7's table.

  // ---- OpenAI GPT-5.2 (https://developers.openai.com/api/docs/pricing) ----
  "gpt-5.2":           { input:  2.50, cacheWrite5m:  2.50, cacheWrite1h:  2.50, cacheRead: 0.25,   output: 10.00 },
  "gpt-5.2-codex":     { input:  2.50, cacheWrite5m:  2.50, cacheWrite1h:  2.50, cacheRead: 0.25,   output: 10.00 },
  "gpt-5.2-pro":       { input: 15.00, cacheWrite5m: 15.00, cacheWrite1h: 15.00, cacheRead: 1.50,   output: 60.00 },

  // ---- Google Gemini 3.x (https://ai.google.dev/gemini-api/docs/pricing) ----
  "gemini-3-flash":    { input:  0.30, cacheWrite5m:  0.30, cacheWrite1h:  0.30, cacheRead: 0.075,  output:  2.50 },
  "gemini-3-pro":      { input:  1.25, cacheWrite5m:  1.25, cacheWrite1h:  1.25, cacheRead: 0.3125, output: 10.00 },
  "gemini-3.1-pro":    { input:  1.25, cacheWrite5m:  1.25, cacheWrite1h:  1.25, cacheRead: 0.3125, output: 10.00 },

  // ---- xAI Grok-4-1-fast (https://x.ai/api) ----
  // Reasoning variant uses the same per-token rate; it just spends more output
  // tokens on hidden chain-of-thought. Margin absorbs the per-call variance.
  "grok-4-1-fast-non-reasoning": { input: 0.20, cacheWrite5m: 0.20, cacheWrite1h: 0.20, cacheRead: 0.05, output: 0.50 },
  "grok-4-1-fast-reasoning":     { input: 0.20, cacheWrite5m: 0.20, cacheWrite1h: 0.20, cacheRead: 0.05, output: 0.50 },

  // ---- DeepSeek (https://api-docs.deepseek.com/quick_start/pricing) ----
  "deepseek-chat":     { input:  0.27, cacheWrite5m:  0.27, cacheWrite1h:  0.27, cacheRead: 0.07,   output:  1.10 },
  "deepseek-reasoner": { input:  0.55, cacheWrite5m:  0.55, cacheWrite1h:  0.55, cacheRead: 0.14,   output:  2.19 },
  "deepseek-v3.2":     { input:  0.27, cacheWrite5m:  0.27, cacheWrite1h:  0.27, cacheRead: 0.07,   output:  1.10 },

  // ---- MiniMax m2.5 (https://www.minimaxi.com/en/platform/pricing) ----
  "minimax-m2.5":      { input:  0.30, cacheWrite5m:  0.30, cacheWrite1h:  0.30, cacheRead: 0.03,   output:  1.50 },
  "minimax-m2.5-slow": { input:  0.15, cacheWrite5m:  0.15, cacheWrite1h:  0.15, cacheRead: 0.015,  output:  0.75 },

  // ---- Alibaba Qwen3 (https://www.alibabacloud.com/help/en/model-studio/billing-for-model-studio) ----
  "qwen3-235b":        { input:  0.30, cacheWrite5m:  0.30, cacheWrite1h:  0.30, cacheRead: 0.03,   output:  1.20 },
  "qwen3-80b-next":    { input:  0.15, cacheWrite5m:  0.15, cacheWrite1h:  0.15, cacheRead: 0.015,  output:  0.60 },
  "qwen3-coder-flash": { input:  0.20, cacheWrite5m:  0.20, cacheWrite1h:  0.20, cacheRead: 0.02,   output:  1.00 },

  // ---- Perplexity Sonar (https://docs.perplexity.ai/guides/pricing) ----
  // Sonar also charges a per-search-query fee on top of tokens; not modelled
  // here. Operators serving heavy search traffic should bake that into
  // BILLING_MARGIN_BPS or add a separate accrual.
  "perplexity/sonar":                 { input: 1.00, cacheWrite5m: 1.00, cacheWrite1h: 1.00, cacheRead: 0.10, output:  1.00 },
  "perplexity/sonar-deep-research":   { input: 2.00, cacheWrite5m: 2.00, cacheWrite1h: 2.00, cacheRead: 0.20, output:  8.00 },

  // ---- Cerebras / zai-glm-4.7 (Cerebras-hosted GLM, same model as glm-4.7) ----
  "cerebras/zai-glm-4.7": { input: 0.80, cacheWrite5m: 1.00, cacheWrite1h: 1.60, cacheRead: 0.08, output: 4.00 },
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
  // Anthropic — present for forward-compat. Tokamak LiteLLM does NOT currently
  // route Claude ids; requests will 502 + auto-refund until/unless someone
  // adds claude routing to api.ai.tokamak.network's model_list.
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-haiku-3-5",

  // OpenAI GPT-5.4 — same forward-compat note. Tokamak LiteLLM now routes 5.2.
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",

  // Google Gemini 2.5 — same forward-compat note. Tokamak LiteLLM routes 3.x.
  "gemini-2.5-pro",
  "gemini-2.5-flash",

  // ---- Actually served by Tokamak LiteLLM as of 2026-05-16 ----
  // Verified via `GET https://api.ai.tokamak.network/v1/models`.
  "glm-4.7",
  "cerebras/zai-glm-4.7",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.2-pro",
  "gemini-3-flash",
  "gemini-3-pro",
  "gemini-3.1-pro",
  "grok-4-1-fast-non-reasoning",
  "grok-4-1-fast-reasoning",
  "deepseek-chat",
  "deepseek-reasoner",
  "deepseek-v3.2",
  "minimax-m2.5",
  "minimax-m2.5-slow",
  "qwen3-235b",
  "qwen3-80b-next",
  "qwen3-coder-flash",
  "perplexity/sonar",
  "perplexity/sonar-deep-research",
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
