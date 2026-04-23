import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock persistence
vi.mock("../persistence.js", () => ({
  getStrategy: vi.fn(),
  updateStrategy: vi.fn(),
}));

// Mock kind-registry
vi.mock("../kind-registry.js", () => ({
  getKind: vi.fn(),
}));

import { startStrategyAction, stopStrategyAction } from "../actions/start-stop.js";
import { getStrategy, updateStrategy } from "../persistence.js";
import { getKind } from "../kind-registry.js";
import type { Strategy } from "../types.js";

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "s1",
    name: "Test Strategy",
    description: "A strategy",
    kind: "yield-auto-compound",
    params: { threshold: 0.5 },
    vault: { chainId: 137, address: "0xdeadbeef00000000000000000000000000000001" },
    schedule: { everyMs: 60_000 },
    status: "draft",
    createdAt: Date.now(),
    tickHistory: [],
    ...overrides,
  };
}

const fakeRuntime = { getSetting: () => undefined } as any;
const fakeMsg = {} as any;
const fakeState = {} as any;

function makeOptions(params: Record<string, unknown>) {
  return { parameters: params };
}

describe("START_STRATEGY", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateStrategy).mockResolvedValue(makeStrategy() as any);
  });

  it("returns error when id is missing", async () => {
    const result = await startStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({}) as any,
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("Missing required parameter: id");
  });

  it("returns error when strategy not found", async () => {
    vi.mocked(getStrategy).mockResolvedValue(undefined);
    const result = await startStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "nonexistent" }) as any,
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("not found");
  });

  it("returns error when strategy is stopped", async () => {
    vi.mocked(getStrategy).mockResolvedValue(makeStrategy({ status: "stopped" }) as any);
    const result = await startStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "s1" }) as any,
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("stopped");
  });

  it("returns error when kind is not registered", async () => {
    vi.mocked(getStrategy).mockResolvedValue(makeStrategy() as any);
    vi.mocked(getKind).mockReturnValue(undefined);
    const result = await startStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "s1" }) as any,
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("not registered");
  });

  it("returns error when params fail kind schema validation", async () => {
    vi.mocked(getStrategy).mockResolvedValue(makeStrategy() as any);
    vi.mocked(getKind).mockReturnValue({
      kind: "yield-auto-compound",
      paramSchema: {
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: { message: "threshold must be positive" },
        }),
      },
    } as any);
    const result = await startStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "s1" }) as any,
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("params validation failed");
  });

  it("starts with testing mode by default", async () => {
    vi.mocked(getStrategy).mockResolvedValue(makeStrategy() as any);
    vi.mocked(getKind).mockReturnValue({
      kind: "yield-auto-compound",
      paramSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
    } as any);
    const result = await startStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "s1" }) as any,
    );
    expect(result?.success).toBe(true);
    expect(updateStrategy).toHaveBeenCalledWith(expect.anything(), "s1", { status: "testing" });
    expect(result?.text).toContain("testing");
  });

  it("starts with active mode when specified", async () => {
    vi.mocked(getStrategy).mockResolvedValue(makeStrategy() as any);
    vi.mocked(getKind).mockReturnValue({
      kind: "yield-auto-compound",
      paramSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
    } as any);
    const result = await startStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "s1", mode: "active" }) as any,
    );
    expect(result?.success).toBe(true);
    expect(updateStrategy).toHaveBeenCalledWith(expect.anything(), "s1", { status: "active" });
    expect(result?.text).toContain("active");
  });

  it("returns error for invalid mode", async () => {
    vi.mocked(getStrategy).mockResolvedValue(makeStrategy() as any);
    const result = await startStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "s1", mode: "invalid" }) as any,
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("Invalid mode");
  });
});

describe("STOP_STRATEGY", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateStrategy).mockResolvedValue(makeStrategy({ status: "stopped" }) as any);
  });

  it("returns error when id is missing", async () => {
    const result = await stopStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({}) as any,
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("Missing required parameter: id");
  });

  it("returns error when strategy not found", async () => {
    vi.mocked(getStrategy).mockResolvedValue(undefined);
    const result = await stopStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "nonexistent" }) as any,
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("not found");
  });

  it("idempotent — stopping already-stopped strategy returns success", async () => {
    vi.mocked(getStrategy).mockResolvedValue(makeStrategy({ status: "stopped" }) as any);
    const result = await stopStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "s1" }) as any,
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("already stopped");
    expect(updateStrategy).not.toHaveBeenCalled();
  });

  it("transitions active strategy to stopped", async () => {
    vi.mocked(getStrategy).mockResolvedValue(makeStrategy({ status: "active" }) as any);
    const result = await stopStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "s1" }) as any,
    );
    expect(result?.success).toBe(true);
    expect(updateStrategy).toHaveBeenCalledWith(expect.anything(), "s1", { status: "stopped" });
    expect(result?.data?.["status"]).toBe("stopped");
  });

  it("transitions testing strategy to stopped", async () => {
    vi.mocked(getStrategy).mockResolvedValue(makeStrategy({ status: "testing" }) as any);
    const result = await stopStrategyAction.handler!(
      fakeRuntime,
      fakeMsg,
      fakeState,
      makeOptions({ id: "s1" }) as any,
    );
    expect(result?.success).toBe(true);
    expect(updateStrategy).toHaveBeenCalledWith(expect.anything(), "s1", { status: "stopped" });
  });
});
