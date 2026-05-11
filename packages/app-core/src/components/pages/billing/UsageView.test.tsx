/**
 * Tests for UsageView
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { UsageView } from "./UsageView.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUMMARY = {
  wallet: "0xabc",
  window: { since: "2026-04-11T00:00:00Z", until: "2026-05-11T00:00:00Z" },
  totalInputTokens: 12345,
  totalOutputTokens: 678,
  totalCostUsd: "0.05",
  totalCostPton: "50000000000000000",
  callCount: 42,
};

const CALLS = {
  wallet: "0xabc",
  calls: [
    {
      id: "call-1",
      ts: "2026-05-10T10:00:00Z",
      model: "claude-3-opus",
      inputTokens: 1000,
      outputTokens: 200,
      cacheInputTokens: 0,
      cacheCreationTokens: 0,
      costUsd: "0.001",
      costPton: "1000000000000000",
      status: "ok",
      apiKeyId: null,
    },
  ],
  hasMore: false,
};

const KEYS = {
  wallet: "0xabc",
  items: [
    {
      apiKeyId: "key-1",
      name: "my-app",
      createdAt: "2026-01-01T00:00:00Z",
      revokedAt: null,
      callCount: 10,
      totalInputTokens: 5000,
      totalOutputTokens: 500,
      totalCostUsd: "0.02",
      totalCostPton: "20000000000000000",
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubAllFetches(summary = SUMMARY, calls = CALLS, keys = KEYS) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/v1/usage/summary")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(summary),
      });
    }
    if (url.includes("/v1/usage/calls")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(calls),
      });
    }
    if (url.includes("/v1/usage/keys")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(keys),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UsageView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows loading skeleton on first render", () => {
    vi.stubGlobal("fetch", stubAllFetches());
    render(<UsageView />);
    const animatedPulse = document.querySelector(".animate-pulse");
    expect(animatedPulse).not.toBeNull();
  });

  it("renders summary cards after successful fetch", async () => {
    vi.stubGlobal("fetch", stubAllFetches());

    render(<UsageView />);

    await waitFor(() => {
      expect(screen.getByText("Calls")).toBeTruthy();
    });

    expect(screen.getByText("42")).toBeTruthy(); // call count
    expect(screen.getByText(/12,345/)).toBeTruthy(); // input tokens
    expect(screen.getByText(/678/)).toBeTruthy(); // output tokens
  });

  it("renders recent calls table", async () => {
    vi.stubGlobal("fetch", stubAllFetches());

    render(<UsageView />);

    await waitFor(() => {
      expect(screen.getByText("claude-3-opus")).toBeTruthy();
    });

    expect(screen.getByText("ok")).toBeTruthy();
    expect(screen.getByText(/1,000/)).toBeTruthy(); // input tokens
  });

  it("renders per-key breakdown when keys are present", async () => {
    vi.stubGlobal("fetch", stubAllFetches());

    render(<UsageView />);

    await waitFor(() => {
      expect(screen.getByText("Per-Key Breakdown")).toBeTruthy();
    });

    expect(screen.getByText("my-app")).toBeTruthy();
  });

  it("shows 401 error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      }),
    );

    render(<UsageView />);

    await waitFor(() => {
      expect(screen.getByText("Sign in to view usage.")).toBeTruthy();
    });
  });

  it("shows network error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<UsageView />);

    await waitFor(() => {
      expect(
        screen.getByText(/Network error.*could not load usage data/),
      ).toBeTruthy();
    });
  });

  it("auto-refreshes every 60 seconds", async () => {
    const fetchMock = stubAllFetches();
    vi.stubGlobal("fetch", fetchMock);

    render(<UsageView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3)); // 3 parallel fetches

    vi.advanceTimersByTime(60_000);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
  });

  it("shows empty state when no calls exist", async () => {
    vi.stubGlobal(
      "fetch",
      stubAllFetches(
        { ...SUMMARY, callCount: 0 },
        { wallet: "0xabc", calls: [], hasMore: false },
        { wallet: "0xabc", items: [] },
      ),
    );

    render(<UsageView />);

    await waitFor(() => {
      expect(screen.getByText(/No calls in the last 30 days/)).toBeTruthy();
    });
  });
});
