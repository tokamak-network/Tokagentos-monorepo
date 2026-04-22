import { describe, expect, it } from 'vitest';
import {
  AAVE_V3_POLYGON,
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
