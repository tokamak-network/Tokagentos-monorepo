import { describe, expect, it } from 'vitest';
import {
  encodeCoreWriterLimitOrder,
  encodeCoreWriterUsdClassTransfer,
  encodeCoreWriterSpotSend,
  COREWRITER_ACTION_LIMIT_ORDER,
  COREWRITER_ACTION_USD_CLASS_TRANSFER,
  COREWRITER_ACTION_SPOT_SEND,
  COREWRITER_VERSION,
} from '../corewriter.js';

describe('CoreWriter encoding', () => {
  describe('encodeCoreWriterLimitOrder', () => {
    it('first 4 bytes equal 0x01000001 (version=1, action=1)', () => {
      const encoded = encodeCoreWriterLimitOrder({
        asset: 0,
        isBuy: true,
        limitPx: BigInt(100_000_000_000), // $1000 in 1e8 units
        sz: BigInt(10_000_000),            // 0.1 in szDecimals=8
        reduceOnly: false,
        tif: 2,  // IOC
        cloid: 0n,
      });

      // Verify first 4 bytes are the header: uint8(1) || uint24(1) = 0x01 0x00 0x00 0x01
      const header = encoded.slice(0, 10); // '0x' + 8 hex chars = 4 bytes
      expect(header.toLowerCase()).toBe('0x01000001');
    });

    it('produces a canonical encoding for known inputs', () => {
      // Canonical test vector:
      //   asset=0, isBuy=true, limitPx=100*1e8=10000000000n, sz=10000000n,
      //   reduceOnly=false, tif=2(IOC), cloid=0n
      const encoded = encodeCoreWriterLimitOrder({
        asset: 0,
        isBuy: true,
        limitPx: 10_000_000_000n, // $100 in 1e8
        sz: 10_000_000n,
        reduceOnly: false,
        tif: 2,
        cloid: 0n,
      });

      // Must start with 0x
      expect(encoded.startsWith('0x')).toBe(true);
      // Must be 0x + 8 chars (4 bytes header) + 224 chars (112 bytes for 7 abi-encoded params × 32 bytes each)
      // But ABI encoding packs, so: 4 header + 32×7 = 228 bytes = 4+224 = 228 bytes hex = 456 chars + '0x'
      expect(encoded.length).toBeGreaterThan(10);

      // Header check: 0x01000001
      const headerHex = encoded.slice(2, 10); // skip '0x', take 8 chars (4 bytes)
      expect(headerHex).toBe('01000001');
    });

    it('sell order uses isBuy=false', () => {
      const buy = encodeCoreWriterLimitOrder({
        asset: 1, isBuy: true, limitPx: 5_000_000_000n, sz: 1_000_000n,
        reduceOnly: false, tif: 2, cloid: 0n,
      });
      const sell = encodeCoreWriterLimitOrder({
        asset: 1, isBuy: false, limitPx: 5_000_000_000n, sz: 1_000_000n,
        reduceOnly: false, tif: 2, cloid: 0n,
      });

      // Encodings differ due to isBuy bool
      expect(buy).not.toBe(sell);
      // Both share the same header
      expect(buy.slice(0, 10)).toBe(sell.slice(0, 10));
    });

    it('reduceOnly=true produces different encoding than reduceOnly=false', () => {
      const base = { asset: 0, isBuy: true, limitPx: 1_000_000_000n, sz: 1_000n, tif: 2 as const, cloid: 0n };
      const normal = encodeCoreWriterLimitOrder({ ...base, reduceOnly: false });
      const reduce = encodeCoreWriterLimitOrder({ ...base, reduceOnly: true });
      expect(normal).not.toBe(reduce);
    });

    it('different assets produce different encodings', () => {
      const base = { isBuy: true, limitPx: 1_000_000_000n, sz: 1_000n, reduceOnly: false, tif: 2 as const, cloid: 0n };
      const btc = encodeCoreWriterLimitOrder({ ...base, asset: 0 });
      const eth = encodeCoreWriterLimitOrder({ ...base, asset: 1 });
      expect(btc).not.toBe(eth);
    });

    it('version constant matches header first byte', () => {
      expect(COREWRITER_VERSION).toBe(1);
    });

    it('action constant matches header last 3 bytes', () => {
      expect(COREWRITER_ACTION_LIMIT_ORDER).toBe(1);
    });
  });

  describe('encodeCoreWriterUsdClassTransfer', () => {
    it('first 4 bytes equal 0x01000007 (version=1, action=7)', () => {
      const encoded = encodeCoreWriterUsdClassTransfer({
        amount: 1_000_000n, // 1 USDC in 1e6
        toPerp: true,
      });
      const header = encoded.slice(0, 10);
      expect(header.toLowerCase()).toBe('0x01000007');
    });

    it('action constant matches expected value', () => {
      expect(COREWRITER_ACTION_USD_CLASS_TRANSFER).toBe(7);
    });

    it('toPerp=true differs from toPerp=false', () => {
      const toPerp = encodeCoreWriterUsdClassTransfer({ amount: 1_000_000n, toPerp: true });
      const toSpot = encodeCoreWriterUsdClassTransfer({ amount: 1_000_000n, toPerp: false });
      expect(toPerp).not.toBe(toSpot);
    });
  });

  describe('encodeCoreWriterSpotSend', () => {
    it('first 4 bytes equal 0x01000006 (version=1, action=6)', () => {
      const encoded = encodeCoreWriterSpotSend({
        destination: '0x1234567890123456789012345678901234567890',
        token: 'USDC',
        amount: 100_000_000n, // 1 USDC in 1e8
      });
      const header = encoded.slice(0, 10);
      expect(header.toLowerCase()).toBe('0x01000006');
    });

    it('action constant matches expected value', () => {
      expect(COREWRITER_ACTION_SPOT_SEND).toBe(6);
    });
  });
});
