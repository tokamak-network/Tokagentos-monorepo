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

  it('has 1 action (Phase 9: SETUP_BILLING)', () => {
    expect(Array.isArray(tokagentBillingPlugin.actions)).toBe(true);
    expect(tokagentBillingPlugin.actions?.length).toBe(1);
    expect(tokagentBillingPlugin.actions?.[0]?.name).toBe('SETUP_BILLING');
  });

  it('has an empty providers array', () => {
    expect(Array.isArray(tokagentBillingPlugin.providers)).toBe(true);
    expect(tokagentBillingPlugin.providers?.length).toBe(0);
  });

  it('registers 0 services by default (v2.0.7 — client-mode is the new default)', () => {
    // v2.0.7 default flip: BILLING_MODE now defaults to 'client', so the Plugin.services
    // array is empty by default. Client-mode delegates all worker lifecycle to the
    // upstream Railway billing server — mounting them locally would race the gateway.
    // To get 5 services, set BILLING_MODE=server explicitly.
    expect(Array.isArray(tokagentBillingPlugin.services)).toBe(true);
    expect(tokagentBillingPlugin.services?.length).toBe(0);
  });

  it('mode-aware services contract: server → 5, client → 0', () => {
    // This documents the contract enforced in src/index.ts. The actual
    // services array is fixed at module load (see BILLING_MODE detection
    // above), so we cannot flip it mid-test, but we assert the static
    // expectation for the default install.
    // v2.0.7: default is client → any value other than 'server' resolves to client.
    const mode = process.env.BILLING_MODE === 'server' ? 'server' : 'client';
    const expected = mode === 'server' ? 5 : 0;
    expect(tokagentBillingPlugin.services?.length).toBe(expected);
  });

  it('has init and dispose lifecycle hooks (Phase 6a)', () => {
    expect(typeof tokagentBillingPlugin.init).toBe('function');
    expect(typeof tokagentBillingPlugin.dispose).toBe('function');
  });

  it('exposes the expected routes with rawPath=true', () => {
    // Route inventory grew with Phase 9 (setup-routes, setup-panel-routes)
    // and the operator dashboard SPA. Rather than hard-coding a fragile
    // exact count, assert the contract: at least the Phase 6b minimum (21)
    // plus rawPath enforcement on every entry, plus presence of the known
    // dashboard route.
    expect(Array.isArray(tokagentBillingPlugin.routes)).toBe(true);
    const routes = tokagentBillingPlugin.routes ?? [];
    expect(routes.length).toBeGreaterThanOrEqual(21);
    for (const route of routes) {
      expect(route.rawPath).toBe(true);
    }
    const paths = routes.map((r) => r.path);
    expect(paths).toContain('/v1/billing/dashboard');
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
