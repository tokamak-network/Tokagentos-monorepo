/**
 * Tests for the SETUP_BILLING action.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { Content, IAgentRuntime, Memory } from "@elizaos/core";

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
  it("replies with default server-mode (self-hosted) wizard when billing is not initialized (v2.0.5)", async () => {
    // v2.0.5 default: server-mode self-hosted. The wizard lists the 5 things
    // the operator needs (Postgres, RPC, vault, PTON, operator key), links the
    // setup panel, and offers a "say 'I have a gateway URL'" hint to switch
    // to client-mode.
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
    expect(replies[0]).toMatch(/ClaudeVault/i);
    expect(replies[0]).toMatch(/Postgres/i);
    expect(replies[0]).toMatch(/Operator/i);
    // Includes the gateway-URL escape hatch hint.
    expect(replies[0]).toMatch(/gateway URL/i);
  });

  it("branches to client-mode reply when user says 'gateway URL'", async () => {
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
    expect(replies[0]).toMatch(/billing\.example\.com/i);
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

  it("server-mode reply is the same whether BILLING_MODE=server is set explicitly or not (server is default)", async () => {
    billingStateMock.initialized = false;
    const replies: string[] = [];
    await setupBillingAction.handler!(
      makeRuntime({ SERVER_PORT: "2138", BILLING_MODE: "server" }),
      makeMessage("set up billing"),
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
