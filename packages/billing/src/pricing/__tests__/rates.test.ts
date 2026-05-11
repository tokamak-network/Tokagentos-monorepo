import { describe, it, expect } from 'vitest';
import {
  PRICING,
  SUPPORTED_MODELS,
  SUPPORTED_MODELS_ARR,
  UnsupportedModelError,
  DisallowedModifierError,
  getRates,
  assertSupportedModel,
  assertNoDisallowedModifiers,
  normalizeModelId,
  estimateMaxCostUsd,
} from '../rates.js';

// Source: proxy/test/pricing.test.ts — "every SUPPORTED_MODELS entry has a PRICING row"
describe('SUPPORTED_MODELS / PRICING alignment', () => {
  it('every SUPPORTED_MODELS entry has a PRICING row', () => {
    for (const model of SUPPORTED_MODELS) {
      expect(PRICING[model], `SUPPORTED_MODELS contains '${model}' but PRICING has no rates`).toBeTruthy();
    }
  });

  it('SUPPORTED_MODELS_ARR is a subset of SUPPORTED_MODELS', () => {
    for (const model of SUPPORTED_MODELS_ARR) {
      expect(SUPPORTED_MODELS.has(model)).toBe(true);
    }
  });

  it('PRICING rates are positive and output >= input', () => {
    for (const [model, rates] of Object.entries(PRICING)) {
      expect(rates.input, `${model}.input`).toBeGreaterThan(0);
      expect(rates.output, `${model}.output`).toBeGreaterThan(0);
      expect(rates.cacheRead, `${model}.cacheRead`).toBeGreaterThanOrEqual(0);
      expect(rates.output, `${model}: output >= input`).toBeGreaterThanOrEqual(rates.input);
    }
  });
});

// Source: "getRates returns rates for known models and throws for unknown"
describe('getRates', () => {
  it('returns rates for known model', () => {
    const rates = getRates('glm-4.7');
    expect(rates.input).toBe(0.8);
    expect(rates.output).toBe(4.0);
  });

  it('throws UnsupportedModelError for unknown model', () => {
    expect(() => getRates('made-up-model')).toThrow(UnsupportedModelError);
  });
});

// Source: "assertSupportedModel accepts allowlisted models, rejects the rest"
describe('assertSupportedModel', () => {
  it('accepts allowlisted models', () => {
    expect(() => assertSupportedModel('glm-4.7')).not.toThrow();
    expect(() => assertSupportedModel('claude-haiku-3-5')).not.toThrow();
  });

  it('rejects non-allowlisted models', () => {
    expect(() => assertSupportedModel('claude-opus-4')).toThrow(UnsupportedModelError);
    expect(() => assertSupportedModel('gpt-4o')).toThrow(UnsupportedModelError);
  });
});

// Source: "new OpenAI / Gemini models are on the allowlist and priced to match vendor docs"
const vendorRates = {
  'gpt-5.4':          { input: 2.50, cacheRead: 0.25,  output: 15.00 },
  'gpt-5.4-mini':     { input: 0.75, cacheRead: 0.075, output:  4.50 },
  'gpt-5.4-nano':     { input: 0.20, cacheRead: 0.02,  output:  1.25 },
  'gemini-2.5-pro':   { input: 1.25, cacheRead: 0.125, output: 10.00 },
  'gemini-2.5-flash': { input: 0.30, cacheRead: 0.03,  output:  2.50 },
};

describe('OpenAI / Gemini vendor rate parity', () => {
  it('new OpenAI / Gemini models are on the allowlist and priced to match vendor docs', () => {
    for (const [model, expected] of Object.entries(vendorRates)) {
      expect(SUPPORTED_MODELS.has(model), `${model} must be in SUPPORTED_MODELS`).toBe(true);
      const rates = getRates(model);
      expect(rates.input).toBe(expected.input);
      expect(rates.output).toBe(expected.output);
      expect(rates.cacheRead).toBe(expected.cacheRead);
      // Non-Anthropic vendors do not charge a cache-write premium.
      expect(rates.cacheWrite5m).toBe(expected.input);
      expect(rates.cacheWrite1h).toBe(expected.input);
    }
  });
});

// Source: "assertNoDisallowedModifiers rejects batch/fast/inference_geo"
describe('assertNoDisallowedModifiers', () => {
  it('accepts a plain request', () => {
    expect(() => assertNoDisallowedModifiers({ model: 'glm-4.7' })).not.toThrow();
  });

  it('rejects batch', () => {
    expect(() => assertNoDisallowedModifiers({ model: 'glm-4.7', batch: true })).toThrow(DisallowedModifierError);
  });

  it('rejects fast mode', () => {
    expect(() => assertNoDisallowedModifiers({ model: 'glm-4.7', fast: true })).toThrow(DisallowedModifierError);
  });

  it('rejects inference_geo', () => {
    expect(() => assertNoDisallowedModifiers({ model: 'glm-4.7', inference_geo: 'us' })).toThrow(DisallowedModifierError);
  });

  it('rejects inference_geo in metadata', () => {
    expect(() =>
      assertNoDisallowedModifiers({ model: 'glm-4.7', metadata: { inference_geo: 'us' } }),
    ).toThrow(DisallowedModifierError);
  });
});

// Source: "normalizeModelId strips date stamp and -latest suffixes"
describe('normalizeModelId', () => {
  it('strips date stamp', () => {
    expect(normalizeModelId('claude-opus-4-7-20251022')).toBe('claude-opus-4-7');
  });

  it('strips -latest suffix', () => {
    expect(normalizeModelId('claude-haiku-4-5-latest')).toBe('claude-haiku-4-5');
  });

  it('leaves a clean id unchanged', () => {
    expect(normalizeModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('trims whitespace', () => {
    expect(normalizeModelId('  claude-opus-4-7  ')).toBe('claude-opus-4-7');
  });
});

// Source: "assertSupportedModel and getRates accept dated/latest aliases for known models"
describe('normalizeModelId integration with assertSupportedModel / getRates', () => {
  it('accepts dated alias', () => {
    expect(() => assertSupportedModel('claude-opus-4-7-20251022')).not.toThrow();
    expect(() => assertSupportedModel('claude-haiku-4-5-latest')).not.toThrow();
  });

  it('resolves dated alias to same rates as base id', () => {
    const direct = getRates('claude-opus-4-7');
    const aliased = getRates('claude-opus-4-7-20251022');
    expect(aliased).toEqual(direct);
  });

  it('still rejects an unknown base id even with -latest', () => {
    expect(() => assertSupportedModel('claude-imaginary-9-latest')).toThrow(UnsupportedModelError);
  });
});

describe('estimateMaxCostUsd', () => {
  it('returns input + output cost without cache', () => {
    const rates = getRates('claude-haiku-4-5');
    const got = estimateMaxCostUsd({
      model: 'claude-haiku-4-5',
      inputTokens: 1000,
      maxOutputTokens: 500,
      hasCacheControl: false,
    });
    const expected = (1000 * rates.input + 500 * rates.output) / 1_000_000;
    expect(Math.abs(got - expected)).toBeLessThan(1e-12);
  });

  it('uses cacheWrite1h rate when hasCacheControl + cacheTtl=1h', () => {
    const rates = getRates('claude-haiku-4-5');
    const got = estimateMaxCostUsd({
      model: 'claude-haiku-4-5',
      inputTokens: 1000,
      maxOutputTokens: 0,
      hasCacheControl: true,
      cacheTtl: '1h',
    });
    const expected = (1000 * rates.cacheWrite1h) / 1_000_000;
    expect(Math.abs(got - expected)).toBeLessThan(1e-12);
  });
});
