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

  it('has an empty actions array', () => {
    expect(Array.isArray(tokagentBillingPlugin.actions)).toBe(true);
    expect(tokagentBillingPlugin.actions?.length).toBe(0);
  });

  it('has an empty providers array', () => {
    expect(Array.isArray(tokagentBillingPlugin.providers)).toBe(true);
    expect(tokagentBillingPlugin.providers?.length).toBe(0);
  });

  it('has 5 registered services (Phase 6b: +BillingMiddlewareService)', () => {
    expect(Array.isArray(tokagentBillingPlugin.services)).toBe(true);
    expect(tokagentBillingPlugin.services?.length).toBe(5);
  });

  it('has init and dispose lifecycle hooks (Phase 6a)', () => {
    expect(typeof tokagentBillingPlugin.init).toBe('function');
    expect(typeof tokagentBillingPlugin.dispose).toBe('function');
  });

  it('has 20 routes (2 auth + 3 keys + 1 credits + 7 topup + 4 usage + 3 estimate) with rawPath=true (Phase 6b)', () => {
    expect(Array.isArray(tokagentBillingPlugin.routes)).toBe(true);
    expect(tokagentBillingPlugin.routes?.length).toBe(20);
    for (const route of tokagentBillingPlugin.routes ?? []) {
      expect(route.rawPath).toBe(true);
    }
  });

  it('auth routes mount at /v1/auth/* paths', () => {
    const paths = tokagentBillingPlugin.routes?.map((r) => r.path) ?? [];
    expect(paths).toContain('/v1/auth/nonce');
    expect(paths).toContain('/v1/auth/login');
  });

  it('key routes mount at /v1/keys paths', () => {
    const paths = tokagentBillingPlugin.routes?.map((r) => r.path) ?? [];
    expect(paths).toContain('/v1/keys');
    expect(paths).toContain('/v1/keys/:id');
  });

  it('is exported as both named and default export', async () => {
    const mod = await import('../index.js');
    expect(mod.tokagentBillingPlugin).toBeDefined();
    expect(mod.default).toBeDefined();
    expect(mod.tokagentBillingPlugin).toBe(mod.default);
  });
});
