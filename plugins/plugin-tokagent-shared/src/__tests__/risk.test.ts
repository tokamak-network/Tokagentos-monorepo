import { describe, expect, it } from 'vitest';
import {
  BPS_DENOMINATOR,
  DEFAULT_SLIPPAGE_BPS,
  MAX_APPROVAL,
  applySlippageDown,
  applySlippageUp,
  validateSlippageBps,
} from '../risk.js';

describe('risk', () => {
  describe('MAX_APPROVAL', () => {
    it('equals 2^256 - 1', () => {
      expect(MAX_APPROVAL).toBe(2n ** 256n - 1n);
    });

    it('is a bigint', () => {
      expect(typeof MAX_APPROVAL).toBe('bigint');
    });
  });

  describe('constants', () => {
    it('DEFAULT_SLIPPAGE_BPS is 100', () => {
      expect(DEFAULT_SLIPPAGE_BPS).toBe(100);
    });

    it('BPS_DENOMINATOR is 10_000', () => {
      expect(BPS_DENOMINATOR).toBe(10_000);
    });
  });

  describe('applySlippageDown', () => {
    it('applySlippageDown(100n, 100) returns 99n', () => {
      expect(applySlippageDown(100n, 100)).toBe(99n);
    });

    it('applySlippageDown(1000n, 50) returns 995n', () => {
      expect(applySlippageDown(1000n, 50)).toBe(995n);
    });

    it('uses DEFAULT_SLIPPAGE_BPS when bps not provided', () => {
      // DEFAULT_SLIPPAGE_BPS = 100 (1%)
      expect(applySlippageDown(1000n)).toBe(990n);
    });

    it('applySlippageDown(0n, 100) returns 0n', () => {
      expect(applySlippageDown(0n, 100)).toBe(0n);
    });

    it('applySlippageDown(10000n, 0) returns 10000n (0% slippage)', () => {
      expect(applySlippageDown(10000n, 0)).toBe(10000n);
    });
  });

  describe('applySlippageUp', () => {
    it('applySlippageUp(100n, 100) returns 101n', () => {
      expect(applySlippageUp(100n, 100)).toBe(101n);
    });

    it('applySlippageUp(1000n, 50) returns 1005n', () => {
      expect(applySlippageUp(1000n, 50)).toBe(1005n);
    });

    it('uses DEFAULT_SLIPPAGE_BPS when bps not provided', () => {
      expect(applySlippageUp(1000n)).toBe(1010n);
    });

    it('applySlippageUp(0n, 100) returns 0n', () => {
      expect(applySlippageUp(0n, 100)).toBe(0n);
    });
  });

  describe('validateSlippageBps', () => {
    it('does not throw for 0', () => {
      expect(() => validateSlippageBps(0)).not.toThrow();
    });

    it('does not throw for 5000', () => {
      expect(() => validateSlippageBps(5000)).not.toThrow();
    });

    it('does not throw for 100 (DEFAULT_SLIPPAGE_BPS)', () => {
      expect(() => validateSlippageBps(100)).not.toThrow();
    });

    it('throws for 5001', () => {
      expect(() => validateSlippageBps(5001)).toThrow(RangeError);
    });

    it('throws for negative values', () => {
      expect(() => validateSlippageBps(-1)).toThrow(RangeError);
    });

    it('throws for very large values', () => {
      expect(() => validateSlippageBps(10000)).toThrow(RangeError);
    });
  });
});
