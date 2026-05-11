import { getRates, normalizeModelId } from './rates.js';

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  prompt_tokens?: number; // OpenAI-style (LiteLLM often returns both)
  completion_tokens?: number;
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Pick the canonical token counts out of a provider-reported usage envelope.
 * LiteLLM's Anthropic passthrough sometimes ships OpenAI-shaped aliases
 * (`prompt_tokens` / `completion_tokens`) instead of the native fields, so the
 * billing path and the audit recorder both have to handle either shape — this
 * helper is the single point that knows the aliasing.
 *
 * TODO(phase-6-billing-usemodel): extend normalizeUsage to accept runtime.useModel result shape if it differs from native/openai aliases.
 */
export function normalizeUsage(u: ClaudeUsage): NormalizedUsage {
  return {
    inputTokens: u.input_tokens ?? u.prompt_tokens ?? 0,
    outputTokens: u.output_tokens ?? u.completion_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Actual spend based on provider-reported usage. Supports both Anthropic-native
 * fields and OpenAI-style prompt_/completion_tokens that LiteLLM exposes.
 *
 * Anthropic reports `input_tokens` as the *total* and cache fields as subsets
 * of it (input = non-cache + cacheWrite + cacheRead). LiteLLM passthrough
 * sometimes ships cache fields as separate line-items on top of input. We
 * detect which shape we're looking at by whether the cache total fits inside
 * `input_tokens`; that keeps both paths correct without provider-specific
 * branching.
 *
 * When the caller signalled `hasCacheControl` (the request asked for caching)
 * but the upstream did not report cache fields, treat the entire input as a
 * cache write. Without this, an opaque LiteLLM proxy that strips cache usage
 * would silently bill the user at base rate while we owe Anthropic the cache
 * write rate — direct revenue leakage.
 */
export function computeActualCostUsd(params: {
  model: string;
  usage: ClaudeUsage;
  cacheTtl?: "5m" | "1h";
  hasCacheControl?: boolean;
}): number {
  const r = getRates(params.model);
  const cw = params.cacheTtl === "1h" ? r.cacheWrite1h : r.cacheWrite5m;
  const n = normalizeUsage(params.usage);

  const cacheReported = n.cacheWriteTokens > 0 || n.cacheReadTokens > 0;
  const inputRate = params.hasCacheControl && !cacheReported ? cw : r.input;

  const cacheTotal = n.cacheWriteTokens + n.cacheReadTokens;
  const cacheIsSubset = cacheTotal <= n.inputTokens;
  const nonCacheInput = cacheIsSubset ? n.inputTokens - cacheTotal : n.inputTokens;

  return (
    (nonCacheInput * inputRate +
      n.cacheWriteTokens * cw +
      n.cacheReadTokens * r.cacheRead +
      n.outputTokens * r.output) /
    1_000_000
  );
}

/**
 * Build a usage object representing "we never received a usage report — bill
 * the input we sent, claim zero output". Used by the streaming path when an
 * upstream aborts before emitting any `message_delta` / final chunk: input
 * tokens were already paid to the provider so we must not refund them, but
 * we have no visibility into how much output was actually generated.
 *
 * Calling code should always prefer real usage when present; this is a
 * fallback, not a default.
 */
export function fallbackUsageFromEstimate(estimateInputTokens: number): ClaudeUsage {
  if (estimateInputTokens < 0 || !Number.isFinite(estimateInputTokens)) {
    throw new Error(`fallbackUsageFromEstimate: invalid estimate ${estimateInputTokens}`);
  }
  return { input_tokens: Math.ceil(estimateInputTokens), output_tokens: 0 };
}

// Re-export for convenience — usage.ts consumers frequently need normalizeModelId
export { normalizeModelId };
