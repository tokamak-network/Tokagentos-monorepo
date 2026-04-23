import { describe, expect, it, vi } from "vitest";

// Stub @tokagentos/core so we don't need the compiled dist when running tests.
vi.mock("@tokagentos/core", () => {
  class Service {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    protected runtime: any;
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    constructor(runtime?: any) { if (runtime) this.runtime = runtime; }
    static serviceType = "unknown";
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    static async start(runtime: any) { return new Service(runtime); }
    async stop() {}
  }
  return { Service, ModelType: { TEXT_LARGE: "TEXT_LARGE" } };
});

import tokagentStrategyPlugin from "../index.js";
import { STRATEGY_SCHEMA, registerKind, getKind, listKinds, registerBuiltinKinds } from "../index.js";

describe("tokagentStrategyPlugin", () => {
  it("has the correct name", () => {
    expect(tokagentStrategyPlugin.name).toBe("tokagent-strategy");
  });

  it("has a non-empty description", () => {
    expect(tokagentStrategyPlugin.description).toBeTruthy();
    expect(typeof tokagentStrategyPlugin.description).toBe("string");
    expect(tokagentStrategyPlugin.description.length).toBeGreaterThan(10);
  });

  it("exports exactly 6 actions", () => {
    expect(Array.isArray(tokagentStrategyPlugin.actions)).toBe(true);
    expect(tokagentStrategyPlugin.actions?.length).toBe(6);
  });

  it("exports exactly 1 provider", () => {
    expect(Array.isArray(tokagentStrategyPlugin.providers)).toBe(true);
    expect(tokagentStrategyPlugin.providers?.length).toBe(1);
  });

  it("exports exactly 1 service", () => {
    expect(Array.isArray(tokagentStrategyPlugin.services)).toBe(true);
    expect(tokagentStrategyPlugin.services?.length).toBe(1);
  });

  it("has DEPLOY_TOKAGENT_VAULT action", () => {
    const action = tokagentStrategyPlugin.actions?.find(
      (a) => a.name === "DEPLOY_TOKAGENT_VAULT",
    );
    expect(action).toBeDefined();
    expect(typeof action?.handler).toBe("function");
    expect(typeof action?.validate).toBe("function");
    expect(Array.isArray(action?.similes)).toBe(true);
    expect((action?.similes?.length ?? 0) > 0).toBe(true);
  });

  it("has LIST_STRATEGIES action", () => {
    const action = tokagentStrategyPlugin.actions?.find((a) => a.name === "LIST_STRATEGIES");
    expect(action).toBeDefined();
    expect(typeof action?.handler).toBe("function");
  });

  it("has START_STRATEGY action", () => {
    const action = tokagentStrategyPlugin.actions?.find((a) => a.name === "START_STRATEGY");
    expect(action).toBeDefined();
    expect(typeof action?.handler).toBe("function");
    expect(Array.isArray(action?.parameters)).toBe(true);
  });

  it("has STOP_STRATEGY action", () => {
    const action = tokagentStrategyPlugin.actions?.find((a) => a.name === "STOP_STRATEGY");
    expect(action).toBeDefined();
    expect(typeof action?.handler).toBe("function");
  });

  it("has BUILD_STRATEGY action", () => {
    const action = tokagentStrategyPlugin.actions?.find((a) => a.name === "BUILD_STRATEGY");
    expect(action).toBeDefined();
    expect(typeof action?.handler).toBe("function");
    expect(Array.isArray(action?.parameters)).toBe(true);
    expect((action?.parameters?.length ?? 0) > 0).toBe(true);
  });

  it("has an init hook", () => {
    expect(typeof tokagentStrategyPlugin.init).toBe("function");
  });

  it("has activeStrategies provider", () => {
    const provider = tokagentStrategyPlugin.providers?.find(
      (p) => p.name === "activeStrategies",
    );
    expect(provider).toBeDefined();
    expect(typeof provider?.get).toBe("function");
  });

  it("has StrategyRunnerService", () => {
    const svc = tokagentStrategyPlugin.services?.[0];
    expect(svc).toBeDefined();
    expect((svc as any).serviceType).toBe("tokagent-strategy-runner");
    expect(typeof (svc as any).start).toBe("function");
  });

  it("all actions have similes", () => {
    for (const action of tokagentStrategyPlugin.actions ?? []) {
      expect(Array.isArray(action.similes)).toBe(true);
      expect((action.similes?.length ?? 0) > 0).toBe(true);
    }
  });

  it("actions with parameters have them as arrays", () => {
    for (const action of tokagentStrategyPlugin.actions ?? []) {
      if (action.parameters !== undefined) {
        expect(Array.isArray(action.parameters)).toBe(true);
      }
    }
  });
});

describe("STRATEGY_SCHEMA export", () => {
  it("is a zod schema", () => {
    expect(STRATEGY_SCHEMA).toBeDefined();
    expect(typeof STRATEGY_SCHEMA.safeParse).toBe("function");
  });
});

describe("kind-registry exports", () => {
  it("registerKind, getKind, listKinds are functions", () => {
    expect(typeof registerKind).toBe("function");
    expect(typeof getKind).toBe("function");
    expect(typeof listKinds).toBe("function");
  });

  it("listKinds returns an array", () => {
    expect(Array.isArray(listKinds())).toBe(true);
  });
});

describe("registerBuiltinKinds", () => {
  it("is exported and is a function", () => {
    expect(typeof registerBuiltinKinds).toBe("function");
  });

  it("registers all 3 built-in kinds after being called", () => {
    registerBuiltinKinds();
    expect(listKinds()).toContain("yield-auto-compound");
    expect(listKinds()).toContain("polymarket-value-hunt");
    expect(listKinds()).toContain("perp-funding-arb");
  });

  it("each registered kind has evaluate and execute", () => {
    registerBuiltinKinds();
    for (const k of ["yield-auto-compound", "polymarket-value-hunt", "perp-funding-arb"] as const) {
      const impl = getKind(k);
      expect(impl).toBeDefined();
      expect(typeof impl?.evaluate).toBe("function");
      expect(typeof impl?.execute).toBe("function");
    }
  });
});
