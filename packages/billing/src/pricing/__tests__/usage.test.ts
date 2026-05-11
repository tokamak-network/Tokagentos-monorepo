import { describe, it, expect } from 'vitest';
import {
  normalizeUsage,
  computeActualCostUsd,
  fallbackUsageFromEstimate,
} from '../usage.js';
import { getRates } from '../rates.js';

// ---- normalizeUsage ----
describe('normalizeUsage', () => {
  it('picks native Anthropic fields', () => {
    const n = normalizeUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 10,
    });
    expect(n.inputTokens).toBe(100);
    expect(n.outputTokens).toBe(50);
    expect(n.cacheWriteTokens).toBe(20);
    expect(n.cacheReadTokens).toBe(10);
  });

  it('falls back to OpenAI-style aliases', () => {
    const n = normalizeUsage({ prompt_tokens: 200, completion_tokens: 80 });
    expect(n.inputTokens).toBe(200);
    expect(n.outputTokens).toBe(80);
    expect(n.cacheWriteTokens).toBe(0);
    expect(n.cacheReadTokens).toBe(0);
  });

  it('defaults missing fields to 0', () => {
    const n = normalizeUsage({});
    expect(n.inputTokens).toBe(0);
    expect(n.outputTokens).toBe(0);
    expect(n.cacheWriteTokens).toBe(0);
    expect(n.cacheReadTokens).toBe(0);
  });
});

// Source: "computeActualCostUsd on OpenAI / Gemini usage equals manual recomputation"
describe('computeActualCostUsd — OpenAI / Gemini', () => {
  const vendorRates = {
    'gpt-5.4':          { input: 2.50, cacheRead: 0.25,  output: 15.00 },
    'gpt-5.4-mini':     { input: 0.75, cacheRead: 0.075, output:  4.50 },
    'gpt-5.4-nano':     { input: 0.20, cacheRead: 0.02,  output:  1.25 },
    'gemini-2.5-pro':   { input: 1.25, cacheRead: 0.125, output: 10.00 },
    'gemini-2.5-flash': { input: 0.30, cacheRead: 0.03,  output:  2.50 },
  };

  it('computes correct cost for each vendor model', () => {
    const usage = { input_tokens: 2_000, output_tokens: 500 };
    for (const [model, rate] of Object.entries(vendorRates)) {
      const got = computeActualCostUsd({ model, usage });
      const expected = (usage.input_tokens * rate.input + usage.output_tokens * rate.output) / 1_000_000;
      expect(Math.abs(got - expected), `${model} cost mismatch`).toBeLessThan(1e-12);
    }
  });

  // Source: "computeActualCostUsd applies cacheRead discount on OpenAI / Gemini cache hits"
  it('applies cacheRead discount for gpt-5.4-mini', () => {
    const model = 'gpt-5.4-mini';
    const rate = vendorRates[model];
    const usage = {
      input_tokens: 1_000,
      cache_read_input_tokens: 4_000,
      output_tokens: 200,
    };
    const got = computeActualCostUsd({ model, usage, hasCacheControl: true });
    const expected =
      (usage.input_tokens * rate.input +
        usage.cache_read_input_tokens * rate.cacheRead +
        usage.output_tokens * rate.output) /
      1_000_000;
    expect(Math.abs(got - expected)).toBeLessThan(1e-12);
    // cacheRead discount must actually save money vs. billing at full input rate
    const withoutDiscount =
      (usage.input_tokens * rate.input +
        usage.cache_read_input_tokens * rate.input +
        usage.output_tokens * rate.output) /
      1_000_000;
    expect(got).toBeLessThan(withoutDiscount);
  });
});

// Source: "computeActualCostUsd on Anthropic-native cache: input_tokens includes cache, no double-count"
describe('computeActualCostUsd — Anthropic native cache', () => {
  it('avoids double-counting when cache total is a subset of input_tokens', () => {
    const model = 'claude-haiku-4-5';
    const rates = getRates(model);
    const usage = {
      input_tokens: 10_000,
      cache_creation_input_tokens: 5_000,
      output_tokens: 2_000,
    };
    const got = computeActualCostUsd({ model, usage, hasCacheControl: true });
    const expected =
      (5_000 * rates.input + 5_000 * rates.cacheWrite5m + 2_000 * rates.output) / 1_000_000;
    expect(Math.abs(got - expected)).toBeLessThan(1e-12);
    // Old buggy formula would double-count the cache write tokens
    const buggy = (10_000 * rates.input + 5_000 * rates.cacheWrite5m + 2_000 * rates.output) / 1_000_000;
    expect(got).toBeLessThan(buggy);
  });

  // Source: "computeActualCostUsd on Anthropic-native cache read: only cacheRead rate applies"
  it('bills cache reads at cacheRead rate, not input rate', () => {
    const model = 'claude-sonnet-4-6';
    const rates = getRates(model);
    const usage = {
      input_tokens: 10_000,
      cache_read_input_tokens: 10_000,
      output_tokens: 1_000,
    };
    const got = computeActualCostUsd({ model, usage, hasCacheControl: true });
    const expected = (0 + 10_000 * rates.cacheRead + 1_000 * rates.output) / 1_000_000;
    expect(Math.abs(got - expected)).toBeLessThan(1e-12);
  });

  // Source: "computeActualCostUsd when cache total exceeds input_tokens treats fields as separate (LiteLLM shape)"
  it('treats fields as separate line items when cacheTotal > inputTokens', () => {
    const model = 'gpt-5.4-mini';
    const usage = {
      input_tokens: 1_000,
      cache_read_input_tokens: 4_000,
      output_tokens: 200,
    };
    const got = computeActualCostUsd({ model, usage, hasCacheControl: true });
    const rates = getRates(model);
    const expected =
      (1_000 * rates.input + 4_000 * rates.cacheRead + 200 * rates.output) / 1_000_000;
    expect(Math.abs(got - expected)).toBeLessThan(1e-12);
  });

  it('uses cacheWrite1h rate when cacheTtl=1h', () => {
    const model = 'claude-haiku-4-5';
    const rates = getRates(model);
    const usage = {
      input_tokens: 5_000,
      cache_creation_input_tokens: 5_000,
      output_tokens: 0,
    };
    const got = computeActualCostUsd({ model, usage, cacheTtl: '1h', hasCacheControl: true });
    const expected = (0 * rates.input + 5_000 * rates.cacheWrite1h) / 1_000_000;
    expect(Math.abs(got - expected)).toBeLessThan(1e-12);
    // Must be more expensive than 5m TTL
    const got5m = computeActualCostUsd({ model, usage, cacheTtl: '5m', hasCacheControl: true });
    expect(got).toBeGreaterThan(got5m);
  });

  it('bills entire input at cacheWrite rate when hasCacheControl=true but no cache fields reported (LiteLLM strips usage guard)', () => {
    const model = 'claude-haiku-4-5';
    const rates = getRates(model);
    const usage = { input_tokens: 10_000, output_tokens: 1_000 };  // no cache fields
    const got = computeActualCostUsd({ model, usage, hasCacheControl: true });
    const expected = (10_000 * rates.cacheWrite5m + 1_000 * rates.output) / 1_000_000;
    expect(Math.abs(got - expected)).toBeLessThan(1e-12);
    // Must cost more than base input rate (the whole point of the guard)
    const atInput = (10_000 * rates.input + 1_000 * rates.output) / 1_000_000;
    expect(got).toBeGreaterThan(atInput);
  });
});

// ---- fallbackUsageFromEstimate ----
// Source: "fallbackUsageFromEstimate produces input-only usage from an estimate"
describe('fallbackUsageFromEstimate', () => {
  it('produces input-only usage from an estimate', () => {
    const u = fallbackUsageFromEstimate(123);
    expect(u.input_tokens).toBe(123);
    expect(u.output_tokens).toBe(0);
    expect(u.cache_creation_input_tokens).toBeUndefined();
  });

  // Source: "fallbackUsageFromEstimate ceils a fractional estimate to the next integer"
  it('ceils a fractional estimate', () => {
    const u = fallbackUsageFromEstimate(99.4);
    expect(u.input_tokens).toBe(100);
  });

  // Source: "fallbackUsageFromEstimate rejects negative or non-finite input"
  it('rejects negative input', () => {
    expect(() => fallbackUsageFromEstimate(-1)).toThrow();
  });

  it('rejects NaN', () => {
    expect(() => fallbackUsageFromEstimate(Number.NaN)).toThrow();
  });

  it('rejects Infinity', () => {
    expect(() => fallbackUsageFromEstimate(Number.POSITIVE_INFINITY)).toThrow();
  });

  // Source: "fallbackUsageFromEstimate cost matches input-only billing under computeActualCostUsd"
  it('cost matches input-only billing under computeActualCostUsd', () => {
    const model = 'claude-haiku-4-5';
    const inputTokens = 1000;
    const u = fallbackUsageFromEstimate(inputTokens);
    const usd = computeActualCostUsd({ model, usage: u });
    const rates = getRates(model);
    const expected = (inputTokens * rates.input) / 1_000_000;
    expect(usd).toBe(expected);
  });
});
