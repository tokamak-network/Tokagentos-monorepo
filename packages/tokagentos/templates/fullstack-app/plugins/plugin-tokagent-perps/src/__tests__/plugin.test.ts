import { describe, expect, it } from 'vitest';
import tokagentPerpsPlugin from '../index.js';

describe('tokagentPerpsPlugin', () => {
  it('has the correct name', () => {
    expect(tokagentPerpsPlugin.name).toBe('tokagent-perps');
  });

  it('has a description', () => {
    expect(tokagentPerpsPlugin.description).toBeTruthy();
    expect(typeof tokagentPerpsPlugin.description).toBe('string');
  });

  it('exports exactly 1 action', () => {
    expect(Array.isArray(tokagentPerpsPlugin.actions)).toBe(true);
    expect(tokagentPerpsPlugin.actions?.length).toBe(1);
  });

  it('exports exactly 1 provider', () => {
    expect(Array.isArray(tokagentPerpsPlugin.providers)).toBe(true);
    expect(tokagentPerpsPlugin.providers?.length).toBe(1);
  });

  it('has GET_PERPS_MARKET_INFO action', () => {
    const action = tokagentPerpsPlugin.actions?.find((a) => a.name === 'GET_PERPS_MARKET_INFO');
    expect(action).toBeDefined();
    expect(typeof action?.handler).toBe('function');
    expect(typeof action?.validate).toBe('function');
  });

  it('has hyperliquidPositions provider', () => {
    const provider = tokagentPerpsPlugin.providers?.find((p) => p.name === 'hyperliquidPositions');
    expect(provider).toBeDefined();
    expect(typeof provider?.get).toBe('function');
  });

  it('action has similes', () => {
    const action = tokagentPerpsPlugin.actions?.[0];
    expect(Array.isArray(action?.similes)).toBe(true);
    expect((action?.similes?.length ?? 0) > 0).toBe(true);
  });

  it('action has parameters defined', () => {
    const action = tokagentPerpsPlugin.actions?.[0];
    expect(Array.isArray(action?.parameters)).toBe(true);
    const symbolParam = action?.parameters?.find((p) => p.name === 'symbol');
    expect(symbolParam).toBeDefined();
    expect(symbolParam?.required).toBe(true);
  });
});
