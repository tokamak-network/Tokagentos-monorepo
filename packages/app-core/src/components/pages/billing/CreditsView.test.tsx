/**
 * Tests for CreditsView
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CreditsView } from "./CreditsView.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(response: object, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreditsView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows loading skeleton on first render", () => {
    vi.stubGlobal("fetch", mockFetch({}, 200));
    render(<CreditsView />);
    // Loading skeletons are present — no credit data yet
    const animatedPulse = document.querySelector(".animate-pulse");
    expect(animatedPulse).not.toBeNull();
  });

  it("renders credit balances after successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        wallet: "0xabc",
        balance: "2000000000000000000",
        reserved: "500000000000000000",
        accrued: "100000000000000000",
      }),
    );

    render(<CreditsView />);

    await waitFor(() => {
      expect(screen.getByText("Available Balance")).toBeTruthy();
    });

    // Balance: 2 PTON
    expect(screen.getByText(/2\.0000/)).toBeTruthy();
    // Reserved: 0.5 PTON
    expect(screen.getByText(/0\.5000/)).toBeTruthy();
    // Wallet address
    expect(screen.getByText("0xabc")).toBeTruthy();
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

    render(<CreditsView />);

    await waitFor(() => {
      expect(screen.getByText("Sign in to view credits.")).toBeTruthy();
    });
  });

  it("shows 503 error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      }),
    );

    render(<CreditsView />);

    await waitFor(() => {
      expect(
        screen.getByText("Billing service unavailable."),
      ).toBeTruthy();
    });
  });

  it("shows network error on fetch rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network")));

    render(<CreditsView />);

    await waitFor(() => {
      expect(
        screen.getByText(/Network error.*billing service/),
      ).toBeTruthy();
    });
  });

  it("auto-refreshes every 30 seconds", async () => {
    const fetchMock = mockFetch({
      wallet: "0xabc",
      balance: "1000000000000000000",
      reserved: "0",
      accrued: "0",
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreditsView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    vi.advanceTimersByTime(30_000);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
