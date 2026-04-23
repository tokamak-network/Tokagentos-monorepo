import { describe, expect, it } from 'vitest';
import tokagentPolymarketPlugin from '../index.js';

describe('tokagentPolymarketPlugin', () => {
  it('has the correct name', () => {
    expect(tokagentPolymarketPlugin.name).toBe('tokagent-polymarket');
  });

  it('has a description', () => {
    expect(tokagentPolymarketPlugin.description).toBeTruthy();
    expect(typeof tokagentPolymarketPlugin.description).toBe('string');
  });

  it('exports exactly 1 action', () => {
    expect(Array.isArray(tokagentPolymarketPlugin.actions)).toBe(true);
    expect(tokagentPolymarketPlugin.actions?.length).toBe(1);
  });

  it('exports exactly 1 provider', () => {
    expect(Array.isArray(tokagentPolymarketPlugin.providers)).toBe(true);
    expect(tokagentPolymarketPlugin.providers?.length).toBe(1);
  });

  it('has DESCRIBE_POLYMARKET_MARKET action', () => {
    const action = tokagentPolymarketPlugin.actions?.find(
      (a) => a.name === 'DESCRIBE_POLYMARKET_MARKET',
    );
    expect(action).toBeDefined();
    expect(typeof action?.handler).toBe('function');
    expect(typeof action?.validate).toBe('function');
  });

  it('has polymarketPositions provider', () => {
    const provider = tokagentPolymarketPlugin.providers?.find(
      (p) => p.name === 'polymarketPositions',
    );
    expect(provider).toBeDefined();
    expect(typeof provider?.get).toBe('function');
  });

  it('action has similes', () => {
    const action = tokagentPolymarketPlugin.actions?.[0];
    expect(Array.isArray(action?.similes)).toBe(true);
    expect((action?.similes?.length ?? 0) > 0).toBe(true);
  });

  it('action has parameters defined', () => {
    const action = tokagentPolymarketPlugin.actions?.[0];
    expect(Array.isArray(action?.parameters)).toBe(true);
    const queryParam = action?.parameters?.find((p) => p.name === 'query');
    expect(queryParam).toBeDefined();
    expect(queryParam?.required).toBe(true);
  });
});
