import { describe, expect, it } from 'vitest';
import {
  AAVE_V3_POLYGON,
  HYPERLIQUID_PERPS_HYPEREVM,
  PACKS,
  findPack,
  listPacksForChain,
} from '../protocol-packs.js';

describe('protocol-packs', () => {
  it('findPack("aave-v3-polygon", 137) returns the Aave pack', () => {
    const pack = findPack('aave-v3-polygon', 137);
    expect(pack).toBeDefined();
    expect(pack).toBe(AAVE_V3_POLYGON);
    expect(pack!.displayName).toBe('Aave v3 on Polygon');
    expect(pack!.chainId).toBe(137);
  });

  it('findPack("aave-v3-polygon", 1) returns undefined (wrong chain)', () => {
    const pack = findPack('aave-v3-polygon', 1);
    expect(pack).toBeUndefined();
  });

  it('findPack("nonexistent", 137) returns undefined', () => {
    expect(findPack('nonexistent', 137)).toBeUndefined();
  });

  it('listPacksForChain(137) has at least 1 entry', () => {
    const packs = listPacksForChain(137);
    expect(packs.length).toBeGreaterThanOrEqual(1);
    expect(packs.every((p) => p.chainId === 137)).toBe(true);
  });

  it('listPacksForChain(1) returns empty array (no Ethereum packs yet)', () => {
    const packs = listPacksForChain(1);
    expect(packs).toHaveLength(0);
  });

  // ─── Hyperliquid Perps (HyperEVM, chain 999) ───────────────────────────────

  it('findPack("hyperliquid-perps-hyperevm", 999) returns the Hyperliquid pack', () => {
    const pack = findPack('hyperliquid-perps-hyperevm', 999);
    expect(pack).toBeDefined();
    expect(pack).toBe(HYPERLIQUID_PERPS_HYPEREVM);
    expect(pack!.displayName).toBe('Hyperliquid Perps (HyperEVM)');
    expect(pack!.chainId).toBe(999);
  });

  it('findPack("hyperliquid-perps-hyperevm", 1) returns undefined (wrong chain)', () => {
    expect(findPack('hyperliquid-perps-hyperevm', 1)).toBeUndefined();
  });

  it('listPacksForChain(999) has at least 1 entry', () => {
    const packs = listPacksForChain(999);
    expect(packs.length).toBeGreaterThanOrEqual(1);
    expect(packs.every((p) => p.chainId === 999)).toBe(true);
  });

  it('listPacksForChain(137) still has the Aave entry', () => {
    const packs = listPacksForChain(137);
    const ids = packs.map((p) => p.id);
    expect(ids).toContain('aave-v3-polygon');
  });

  it('HYPERLIQUID_PERPS_HYPEREVM has 2 allowlist entries with correct selectors', () => {
    expect(HYPERLIQUID_PERPS_HYPEREVM.entries).toHaveLength(2);
    const selectors = HYPERLIQUID_PERPS_HYPEREVM.entries.map((e) => e.selector);
    expect(selectors).toContain('0xf4e0b185'); // bridgeHype(uint256)
    expect(selectors).toContain('0xa62c829a'); // dispatchCoreWriter(bytes)
  });

  it('HYPERLIQUID_PERPS_HYPEREVM has 0 approval specs (HyperCore uses no ERC-20 approval)', () => {
    expect(HYPERLIQUID_PERPS_HYPEREVM.approvals).toHaveLength(0);
  });

  it('HYPERLIQUID_PERPS_HYPEREVM bridgeHype entry has correct humanLabel', () => {
    const bridgeEntry = HYPERLIQUID_PERPS_HYPEREVM.entries.find(
      (e) => e.selector === '0xf4e0b185',
    );
    expect(bridgeEntry).toBeDefined();
    expect(bridgeEntry!.humanLabel).toBe('Helper.bridgeHype');
  });

  it('HYPERLIQUID_PERPS_HYPEREVM dispatchCoreWriter entry has correct humanLabel', () => {
    const dispatchEntry = HYPERLIQUID_PERPS_HYPEREVM.entries.find(
      (e) => e.selector === '0xa62c829a',
    );
    expect(dispatchEntry).toBeDefined();
    expect(dispatchEntry!.humanLabel).toBe('Helper.dispatchCoreWriter');
  });

  it('AAVE_V3_POLYGON has 4 allowlist entries with correct selectors', () => {
    expect(AAVE_V3_POLYGON.entries).toHaveLength(4);
    const selectors = AAVE_V3_POLYGON.entries.map((e) => e.selector);
    expect(selectors).toContain('0x617ba037'); // supply
    expect(selectors).toContain('0x69328dec'); // withdraw
    expect(selectors).toContain('0xa415bcad'); // borrow
    expect(selectors).toContain('0x573ade81'); // repay
  });

  it('AAVE_V3_POLYGON has 1 approval spec', () => {
    expect(AAVE_V3_POLYGON.approvals).toHaveLength(1);
  });

  it('all entries in PACKS have id and chainId', () => {
    for (const pack of PACKS) {
      expect(pack.id).toBeTruthy();
      expect(pack.chainId).toBeGreaterThan(0);
    }
  });
});
