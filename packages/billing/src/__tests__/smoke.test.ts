import { describe, it, expect } from 'vitest';
import * as billing from '../index.js';

describe('@tokagentos/billing — Phase 1 smoke', () => {
  it('re-exports the chain addresses module', () => {
    expect(typeof billing.getBillingChainAddresses).toBe('function');
    expect(billing.BILLING_CHAIN_MAP).toBeInstanceOf(Map);
    expect(billing.ETHEREUM_MAINNET.chainId).toBe(1);
  });

  it('returns mainnet config for chainId 1', () => {
    const cfg = billing.getBillingChainAddresses(1);
    expect(cfg).toBeDefined();
    expect(cfg?.name).toMatch(/Ethereum/i);
  });

  it('returns undefined for unknown chain', () => {
    expect(billing.getBillingChainAddresses(424242)).toBeUndefined();
  });
});
