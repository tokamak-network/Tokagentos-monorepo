/**
 * Tests for the SETUP_BILLING action.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { Content, IAgentRuntime, Memory } from "@tokagentos/core";

// ---------------------------------------------------------------------------
// Mock billing state so we can control isBillingStateInitialized()
// ---------------------------------------------------------------------------

const billingStateMock = vi.hoisted(() => ({ initialized: false }));

vi.mock("../../state.js", () => ({
  isBillingStateInitialized: () => billingStateMock.initialized,
  getBillingState: () => { throw new Error("not initialized"); },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { setupBillingAction } from "../../actions/setup-billing.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRuntime(settings: Record<string, string> = {}): IAgentRuntime {
  return {
    getSetting: (key: string) => settings[key] ?? null,
  } as unknown as IAgentRuntime;
}

function makeMessage(text: string): Memory {
  return {
    content: { text },
  } as unknown as Memory;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  billingStateMock.initialized = false;
});

describe("setupBillingAction.validate", () => {
  it("returns true for 'set up billing'", async () => {
    const r = await setupBillingAction.validate(makeRuntime(), makeMessage("set up billing"));
    expect(r).toBe(true);
  });

  it("returns true for 'enable billing'", async () => {
    const r = await setupBillingAction.validate(makeRuntime(), makeMessage("enable billing"));
    expect(r).toBe(true);
  });

  it("returns true for 'configure web3 payments'", async () => {
    const r = await setupBillingAction.validate(makeRuntime(), makeMessage("configure web3 payments"));
    expect(r).toBe(true);
  });

  it("returns true for messages mentioning credits or top-up", async () => {
    expect(await setupBillingAction.validate(makeRuntime(), makeMessage("how do credits work?"))).toBe(true);
    expect(await setupBillingAction.validate(makeRuntime(), makeMessage("I want to top up my account"))).toBe(true);
  });

  it("returns false for unrelated messages", async () => {
    expect(await setupBillingAction.validate(makeRuntime(), makeMessage("what's the weather today?"))).toBe(false);
    expect(await setupBillingAction.validate(makeRuntime(), makeMessage("deploy a vault"))).toBe(false);
  });

  it("available even when billing is already initialized (Z46)", async () => {
    billingStateMock.initialized = true;
    const r = await setupBillingAction.validate(makeRuntime(), makeMessage("set up billing"));
    expect(r).toBe(true);
  });
});

describe("setupBillingAction.handler", () => {
  it("replies with default client-mode (Railway gateway) reply when billing is not initialized (v2.0.7)", async () => {
    // v2.0.7 default flip: client-mode is now default. The wizard leads with the
    // hosted-gateway story (Railway URL), links the setup panel, and mentions the
    // 'I want to self-host' branch for operators who want server-mode.
    billingStateMock.initialized = false;
    const replies: string[] = [];
    await setupBillingAction.handler!(
      makeRuntime({ SERVER_PORT: "2138" }),
      makeMessage("set up billing"),
      undefined,
      undefined,
      async (response: Content) => { replies.push(String(response.text ?? "")); return []; },
    );
    expect(replies.length).toBe(1);
    expect(replies[0]).toMatch(/setup-panel/i);
    // v2.0.7 default is client-mode pointing at Railway.
    expect(replies[0]).toMatch(/billing-service-production-a8e7\.up\.railway\.app/i);
    // Includes the self-host escape hatch hint.
    expect(replies[0]).toMatch(/self.host/i);
  });

  it("branches to client-mode reply when user says 'gateway URL'", async () => {
    // v2.0.7: client-mode is now the default, but users who explicitly say
    // 'gateway URL' get a focused reply mentioning the Railway default URL.
    billingStateMock.initialized = false;
    const replies: string[] = [];
    await setupBillingAction.handler!(
      makeRuntime({ SERVER_PORT: "2138" }),
      makeMessage("I have a gateway URL from my operator"),
      undefined,
      undefined,
      async (response: Content) => { replies.push(String(response.text ?? "")); return []; },
    );
    expect(replies.length).toBe(1);
    expect(replies[0]).toMatch(/Client-mode/i);
    expect(replies[0]).toMatch(/BILLING_MODE=client/);
  });

  it("branches to client-mode reply when user pastes an http(s) URL", async () => {
    billingStateMock.initialized = false;
    const replies: string[] = [];
    await setupBillingAction.handler!(
      makeRuntime({ SERVER_PORT: "2138" }),
      makeMessage("set up billing pointing at https://billing.acme.com please"),
      undefined,
      undefined,
      async (response: Content) => { replies.push(String(response.text ?? "")); return []; },
    );
    expect(replies.length).toBe(1);
    expect(replies[0]).toMatch(/Client-mode/i);
    expect(replies[0]).toMatch(/TOKAGENT_GATEWAY_URL/);
  });

  it("branches to server-mode (self-host) reply when user says 'self-host' or 'server-mode' (v2.0.7)", async () => {
    // v2.0.7: server is no longer the default, but is still reachable by asking.
    // When the user says 'self-host', the wizard gives the 5-item checklist.
    billingStateMock.initialized = false;
    const replies: string[] = [];
    await setupBillingAction.handler!(
      makeRuntime({ SERVER_PORT: "2138" }),
      makeMessage("I want to self-host the billing server"),
      undefined,
      undefined,
      async (response: Content) => { replies.push(String(response.text ?? "")); return []; },
    );
    expect(replies.length).toBe(1);
    expect(replies[0]).toMatch(/setup-panel/i);
    expect(replies[0]).toMatch(/ClaudeVault/i);
    expect(replies[0]).toMatch(/Postgres/i);
  });

  it("informs user billing is already active when initialized", async () => {
    billingStateMock.initialized = true;
    const replies: string[] = [];
    await setupBillingAction.handler!(
      makeRuntime(),
      makeMessage("set up billing"),
      undefined,
      undefined,
      async (response: Content) => { replies.push(String(response.text ?? "")); return []; },
    );
    expect(replies.length).toBe(1);
    expect(replies[0]).toMatch(/already active/i);
    expect(replies[0]).toMatch(/reconfigur/i);
  });

  it("includes action name in callback response", async () => {
    billingStateMock.initialized = false;
    let callbackAction: string | undefined;
    await setupBillingAction.handler!(
      makeRuntime(),
      makeMessage("set up billing"),
      undefined,
      undefined,
      async (response: Content) => {
        callbackAction = typeof response.action === "string" ? response.action : undefined;
        return [];
      },
    );
    expect(callbackAction).toBe("SETUP_BILLING");
  });

  it("does not throw when callback is undefined", async () => {
    await expect(
      setupBillingAction.handler!(makeRuntime(), makeMessage("set up billing"))
    ).resolves.toBeUndefined();
  });
});

describe("setupBillingAction metadata", () => {
  it("has the expected name", () => {
    expect(setupBillingAction.name).toBe("SETUP_BILLING");
  });

  it("has non-empty similes", () => {
    expect(setupBillingAction.similes).toBeDefined();
    expect(setupBillingAction.similes!.length).toBeGreaterThan(0);
  });

  it("has at least two examples", () => {
    expect(setupBillingAction.examples).toBeDefined();
    expect(setupBillingAction.examples!.length).toBeGreaterThanOrEqual(2);
  });
});
