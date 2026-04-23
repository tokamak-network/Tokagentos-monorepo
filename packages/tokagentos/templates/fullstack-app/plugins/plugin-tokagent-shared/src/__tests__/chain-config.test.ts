import { describe, expect, it } from 'vitest';
import {
  ETHEREUM_CONFIG,
  HYPEREVM_CONFIG,
  POLYGON_CONFIG,
  SUPPORTED_CHAIN_IDS,
  getChainConfig,
} from '../chain-config.js';

describe('chain-config', () => {
  it('getChainConfig(1) returns Ethereum config', () => {
    const config = getChainConfig(1);
    expect(config).toBe(ETHEREUM_CONFIG);
    expect(config.chainId).toBe(1);
    expect(config.name).toBe('Ethereum');
    expect(config.nativeSymbol).toBe('ETH');
    expect(config.factoryProxy).toMatch(/^0x/);
  });

  it('getChainConfig(137) returns Polygon config', () => {
    const config = getChainConfig(137);
    expect(config).toBe(POLYGON_CONFIG);
    expect(config.chainId).toBe(137);
    expect(config.name).toBe('Polygon');
    expect(config.nativeSymbol).toBe('MATIC');
  });

  it('getChainConfig(999) returns HyperEVM config', () => {
    const config = getChainConfig(999);
    expect(config).toBe(HYPEREVM_CONFIG);
    expect(config.chainId).toBe(999);
    expect(config.name).toBe('HyperEVM');
    expect(config.nativeSymbol).toBe('HYPE');
  });

  it('getChainConfig(42) throws for unsupported chain', () => {
    expect(() => getChainConfig(42)).toThrow(/Unsupported chainId: 42/);
  });

  it('SUPPORTED_CHAIN_IDS has exactly 3 entries', () => {
    expect(SUPPORTED_CHAIN_IDS.size).toBe(3);
    expect(SUPPORTED_CHAIN_IDS.has(1)).toBe(true);
    expect(SUPPORTED_CHAIN_IDS.has(137)).toBe(true);
    expect(SUPPORTED_CHAIN_IDS.has(999)).toBe(true);
  });

  it('each config has a defaultRpc that starts with https://', () => {
    for (const id of SUPPORTED_CHAIN_IDS) {
      const cfg = getChainConfig(id);
      expect(cfg.defaultRpc).toMatch(/^https:\/\//);
    }
  });

  it('each config has a non-empty explorerUrl', () => {
    for (const id of SUPPORTED_CHAIN_IDS) {
      const cfg = getChainConfig(id);
      expect(cfg.explorerUrl.length).toBeGreaterThan(0);
    }
  });
});
