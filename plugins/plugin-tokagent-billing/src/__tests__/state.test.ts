/**
 * Tests for the billing plugin state singleton (state.ts).
 */

import { describe, it, beforeEach, expect } from "vitest";
import {
  setBillingState,
  getBillingState,
  clearBillingState,
  registerTwapCache,
  isBillingStateInitialized,
  type BillingPluginState,
} from "../state.js";

// ---------------------------------------------------------------------------
// Minimal stubs — we only test the singleton logic, not the DB layer
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<BillingPluginState> = {}): BillingPluginState {
  return {
    pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
    db: {} as BillingPluginState["db"],
    clients: {} as BillingPluginState["clients"],
    config: {} as BillingPluginState["config"],
    ...overrides,
  };
}

beforeEach(async () => {
  // Ensure we always start clean.
  await clearBillingState();
});

describe("isBillingStateInitialized()", () => {
  it("returns false when state has not been set", () => {
    expect(isBillingStateInitialized()).toBe(false);
  });

  it("returns true after setBillingState()", () => {
    setBillingState(makeState());
    expect(isBillingStateInitialized()).toBe(true);
  });
});

describe("setBillingState() + getBillingState()", () => {
  it("returns the same state that was set", () => {
    const state = makeState();
    setBillingState(state);
    expect(getBillingState()).toBe(state);
  });

  it("throws when set a second time without clearing first", () => {
    setBillingState(makeState());
    expect(() => setBillingState(makeState())).toThrow(
      "Billing state already initialized",
    );
  });

  it("throws from getBillingState when not initialized", () => {
    expect(() => getBillingState()).toThrow("Billing state not initialized");
  });
});

describe("clearBillingState()", () => {
  it("clears state so isBillingStateInitialized returns false", async () => {
    setBillingState(makeState());
    expect(isBillingStateInitialized()).toBe(true);
    await clearBillingState();
    expect(isBillingStateInitialized()).toBe(false);
  });

  it("is safe to call when state is already null", async () => {
    // Should not throw
    await expect(clearBillingState()).resolves.toBeUndefined();
  });

  it("allows re-initialization after clear", async () => {
    setBillingState(makeState());
    await clearBillingState();
    const state2 = makeState();
    setBillingState(state2);
    expect(getBillingState()).toBe(state2);
  });
});

describe("registerTwapCache()", () => {
  it("attaches the cache to the shared state", () => {
    setBillingState(makeState());
    const fakeCache = { get: () => ({ tonUsd: 1.5 }) } as unknown as BillingPluginState["twapCache"];
    registerTwapCache(fakeCache!);
    expect(getBillingState().twapCache).toBe(fakeCache);
  });

  it("is a no-op when state is not initialized", () => {
    // Should not throw
    const fakeCache = {} as BillingPluginState["twapCache"];
    expect(() => registerTwapCache(fakeCache!)).not.toThrow();
  });
});
