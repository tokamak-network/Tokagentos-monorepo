import { describe, expect, it } from 'vitest';
import tokagentYieldPlugin from '../index.js';

describe('tokagentYieldPlugin', () => {
  it('has the correct name', () => {
    expect(tokagentYieldPlugin.name).toBe('tokagent-yield');
  });

  it('has a description', () => {
    expect(tokagentYieldPlugin.description).toBeTruthy();
    expect(typeof tokagentYieldPlugin.description).toBe('string');
  });

  it('exports exactly 2 actions', () => {
    expect(Array.isArray(tokagentYieldPlugin.actions)).toBe(true);
    expect(tokagentYieldPlugin.actions?.length).toBe(2);
  });

  it('exports exactly 1 provider', () => {
    expect(Array.isArray(tokagentYieldPlugin.providers)).toBe(true);
    expect(tokagentYieldPlugin.providers?.length).toBe(1);
  });

  it('has DEPOSIT_TO_AAVE action', () => {
    const action = tokagentYieldPlugin.actions?.find((a) => a.name === 'DEPOSIT_TO_AAVE');
    expect(action).toBeDefined();
    expect(typeof action?.handler).toBe('function');
    expect(typeof action?.validate).toBe('function');
  });

  it('has WITHDRAW_FROM_AAVE action', () => {
    const action = tokagentYieldPlugin.actions?.find((a) => a.name === 'WITHDRAW_FROM_AAVE');
    expect(action).toBeDefined();
    expect(typeof action?.handler).toBe('function');
    expect(typeof action?.validate).toBe('function');
  });

  it('has aavePositions provider', () => {
    const provider = tokagentYieldPlugin.providers?.find((p) => p.name === 'aavePositions');
    expect(provider).toBeDefined();
    expect(typeof provider?.get).toBe('function');
  });

  it('actions have similes', () => {
    for (const action of tokagentYieldPlugin.actions ?? []) {
      expect(Array.isArray(action.similes)).toBe(true);
      expect((action.similes?.length ?? 0) > 0).toBe(true);
    }
  });

  it('actions have parameters defined', () => {
    for (const action of tokagentYieldPlugin.actions ?? []) {
      expect(Array.isArray(action.parameters)).toBe(true);
    }
  });
});
