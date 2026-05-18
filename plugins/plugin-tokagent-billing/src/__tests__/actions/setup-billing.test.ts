/**
 * Tests for the SETUP_BILLING action.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { Content, IAgentRuntime, Memory } from "@tokagentos/core";

// ---------------------------------------------------------------------------
// Mock billing state so we can control isBillingStateInitialized()
// ---------------------------------------------------------------------------

const billingStateMock = vi.hoisted(() => ({
  initialized: false,
  gatewayUrl: 'https://gateway.tokagent.ai',
}));

vi.mock("../../state.js", () => ({
  isBillingStateInitialized: () => billingStateMock.initialized,
  getBillingState: () => ({
    config: { gatewayUrl: billingStateMock.gatewayUrl },
  }),
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
  it("replies with setup instructions when billing is not initialized", async () => {
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
    expect(replies[0]).toMatch(/billing setup/i);
    expect(replies[0]).toMatch(/TOKAGENT_GATEWAY_URL/);
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
    expect(replies[0]).toMatch(/TOKAGENT_GATEWAY_URL/);
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
