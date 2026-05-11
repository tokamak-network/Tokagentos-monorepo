import { describe, it, expect } from 'vitest';
import { usdToPton, computeCharge, detectCacheControl } from '../charge.js';

// ---- usdToPton ----
// Source: proxy/test/billing.test.ts

describe('usdToPton', () => {
  // Source: "usdToPton returns 0n for zero or non-positive USD"
  it('returns 0n for zero USD', () => {
    expect(usdToPton(0, 1)).toBe(0n);
  });

  it('returns 0n for negative USD', () => {
    expect(usdToPton(-0.001, 1)).toBe(0n);
  });

  // Source: "usdToPton rejects non-positive or non-finite tonUsd"
  it('throws for tonUsd = 0', () => {
    expect(() => usdToPton(1, 0)).toThrow();
  });

  it('throws for negative tonUsd', () => {
    expect(() => usdToPton(1, -0.5)).toThrow();
  });

  it('throws for NaN tonUsd', () => {
    expect(() => usdToPton(1, Number.NaN)).toThrow();
  });

  it('throws for Infinity tonUsd', () => {
    expect(() => usdToPton(1, Number.POSITIVE_INFINITY)).toThrow();
  });

  // Source: "usdToPton is monotonically non-decreasing in usd"
  it('is monotonically non-decreasing in usd', () => {
    const tonUsd = 0.5;
    const samples = [1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.1, 1, 10, 100];
    let prev = usdToPton(samples[0]!, tonUsd);
    for (let i = 1; i < samples.length; i++) {
      const cur = usdToPton(samples[i]!, tonUsd);
      expect(cur, `usdToPton(${samples[i]}) >= usdToPton(${samples[i-1]})`).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it('is strictly monotone above 1 micro-USD', () => {
    const tonUsd = 0.5;
    const aboveFloor = [1e-6, 2e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.1, 1, 10, 100];
    for (let i = 1; i < aboveFloor.length; i++) {
      expect(
        usdToPton(aboveFloor[i]!, tonUsd),
        `strict monotonicity: ${aboveFloor[i-1]} → ${aboveFloor[i]}`,
      ).toBeGreaterThan(usdToPton(aboveFloor[i-1]!, tonUsd));
    }
  });

  // Source: "usdToPton never under-bills"
  it('never under-bills: result × tonUsdMicro >= ceil(usd×1e6) × 1e18', () => {
    const cases = [
      { usd: 0.000424, tonUsd: 0.486352 },
      { usd: 0.001, tonUsd: 0.5 },
      { usd: 1.0, tonUsd: 3.25 },
      { usd: 12.34, tonUsd: 0.9 },
    ];
    for (const c of cases) {
      const pton = usdToPton(c.usd, c.tonUsd);
      const usdMicroCeil = BigInt(Math.ceil(c.usd * 1_000_000));
      const tonUsdMicro = BigInt(Math.round(c.tonUsd * 1_000_000));
      expect(
        pton * tonUsdMicro >= usdMicroCeil * 10n ** 18n,
        `usdToPton(${c.usd}, ${c.tonUsd}) = ${pton} under-bills`,
      ).toBe(true);
    }
  });
});

// ---- computeCharge ----

describe('computeCharge', () => {
  // Source: "computeCharge: totalPton === actualPton + feePton"
  it('totalPton = actualPton + feePton', () => {
    const cases = [
      { actualUsd: 0.000424, tonUsd: 0.486352, marginBps: 10 },
      { actualUsd: 0.1, tonUsd: 1.5, marginBps: 100 },
      { actualUsd: 1e-9, tonUsd: 0.5, marginBps: 10 },
      { actualUsd: 25, tonUsd: 0.9, marginBps: 250 },
    ];
    for (const c of cases) {
      const s = computeCharge(c);
      expect(s.totalPton).toBe(s.actualPton + s.feePton);
    }
  });

  // Source: "computeCharge: feePton equals actualPton × marginBps / 10000"
  it('feePton = actualPton × marginBps / 10000 (bigint truncation)', () => {
    const cases = [
      { actualUsd: 0.000424, tonUsd: 0.486352, marginBps: 10 },
      { actualUsd: 0.01, tonUsd: 0.5, marginBps: 50 },
      { actualUsd: 1, tonUsd: 1, marginBps: 1000 },
      { actualUsd: 0.5, tonUsd: 0.486352, marginBps: 1 },
    ];
    for (const c of cases) {
      const s = computeCharge(c);
      const expectedFee = (s.actualPton * BigInt(c.marginBps)) / 10_000n;
      expect(s.feePton).toBe(expectedFee);
    }
  });

  // Source: "computeCharge: marginBps=0 yields feePton=0"
  it('marginBps=0 yields feePton=0 and totalPton=actualPton', () => {
    const s = computeCharge({ actualUsd: 0.5, tonUsd: 0.5, marginBps: 0 });
    expect(s.feePton).toBe(0n);
    expect(s.totalPton).toBe(s.actualPton);
  });

  // Source: "computeCharge regression: small-actual scenario does not inflate fee above marginBps"
  it('small-actual scenario: realised fee ratio cannot exceed nominal bps', () => {
    const inputTokens = 10;
    const outputTokens = 104;
    const inputRate = 0.8;
    const outputRate = 4.0;
    const actualUsd = (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
    const s = computeCharge({ actualUsd, tonUsd: 0.486352, marginBps: 10 });
    expect(s.feePton * 10_000n <= s.actualPton * 10n).toBe(true);
    const rem = (s.actualPton * 10n) % 10_000n;
    expect(s.actualPton * 10n - s.feePton * 10_000n).toBe(rem);
  });
});

// ---- detectCacheControl ---- (new helper in Phase 2, B4)

describe('detectCacheControl', () => {
  it('returns hasCacheControl=false for a request with no cache_control', () => {
    const req = {
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'hello' }],
    };
    const result = detectCacheControl(req);
    expect(result.hasCacheControl).toBe(false);
  });

  it('detects 5m cache_control marker', () => {
    const req = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hi', cache_control: { type: 'ephemeral', ttl: '5m' } },
          ],
        },
      ],
    };
    const result = detectCacheControl(req);
    expect(result.hasCacheControl).toBe(true);
    if (result.hasCacheControl) expect(result.cacheTtl).toBe('5m');
  });

  it('detects 1h cache_control marker and reports 1h', () => {
    const req = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hi', cache_control: { type: 'ephemeral', ttl: '1h' } },
          ],
        },
      ],
    };
    const result = detectCacheControl(req);
    expect(result.hasCacheControl).toBe(true);
    if (result.hasCacheControl) expect(result.cacheTtl).toBe('1h');
  });

  it('1h dominates when both 5m and 1h markers are present', () => {
    const req = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'part1', cache_control: { type: 'ephemeral', ttl: '5m' } },
            { type: 'text', text: 'part2', cache_control: { type: 'ephemeral', ttl: '1h' } },
          ],
        },
      ],
    };
    const result = detectCacheControl(req);
    expect(result.hasCacheControl).toBe(true);
    if (result.hasCacheControl) expect(result.cacheTtl).toBe('1h');
  });

  it('handles malformed / unexpected shape gracefully (no cache_control found)', () => {
    const result = detectCacheControl(null);
    expect(result.hasCacheControl).toBe(false);
  });

  it('detects cache_control on system-level content blocks', () => {
    const req = {
      system: [
        { type: 'text', text: 'You are helpful.', cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: 'hi' }],
    };
    const result = detectCacheControl(req);
    // cache_control exists but no ttl key → has=true, ttl defaults to "5m"
    expect(result.hasCacheControl).toBe(true);
    if (result.hasCacheControl) expect(result.cacheTtl).toBe('5m');
  });
});
