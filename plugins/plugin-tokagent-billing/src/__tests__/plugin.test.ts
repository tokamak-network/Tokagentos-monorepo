import { describe, expect, it } from 'vitest';
import tokagentBillingPlugin from '../index.js';

describe('tokagentBillingPlugin', () => {
  it('has the correct name', () => {
    expect(tokagentBillingPlugin.name).toBe('tokagent-billing');
  });

  it('has a description', () => {
    expect(tokagentBillingPlugin.description).toBeTruthy();
    expect(typeof tokagentBillingPlugin.description).toBe('string');
  });

  it('has an empty actions array (Phase 1 scaffold)', () => {
    expect(Array.isArray(tokagentBillingPlugin.actions)).toBe(true);
    expect(tokagentBillingPlugin.actions?.length).toBe(0);
  });

  it('has an empty providers array (Phase 1 scaffold)', () => {
    expect(Array.isArray(tokagentBillingPlugin.providers)).toBe(true);
    expect(tokagentBillingPlugin.providers?.length).toBe(0);
  });

  it('is exported as both named and default export', async () => {
    const mod = await import('../index.js');
    expect(mod.tokagentBillingPlugin).toBeDefined();
    expect(mod.default).toBeDefined();
    expect(mod.tokagentBillingPlugin).toBe(mod.default);
  });
});
