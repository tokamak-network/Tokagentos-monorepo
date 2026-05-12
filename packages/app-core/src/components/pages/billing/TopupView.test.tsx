// @vitest-environment jsdom

/**
 * Tests for TopupView
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";

// Mock @tokagentos/ui to bypass a pre-existing import-time error in
// @tokagentos/ui/composites (missing ./trajectories module). The breakage
// is unrelated to billing — see Phase 7.2 review (Fix 4).
vi.mock("@tokagentos/ui", () => ({
  Button: ({ children, onClick, ...rest }: Record<string, unknown> & { children?: React.ReactNode; onClick?: () => void }) =>
    React.createElement("button", { onClick, ...rest }, children as React.ReactNode),
  Input: (props: Record<string, unknown>) => React.createElement("input", props),
  PagePanel: ({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) =>
    React.createElement("div", rest, children as React.ReactNode),
}));

import { TopupView } from "./TopupView.js";

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

const QUOTE_RESPONSE = {
  topupId: "550e8400-e29b-41d4-a716-446655440000",
  amountUsd: "10.00",
  amountAttoPton: "10000000000000000000",
  expiresAt: new Date(Date.now() + 300_000).toISOString(), // 5 min from now
  receiverAddress: "0xdeadbeef",
  domain: {
    name: "PTON Token",
    version: "1",
    chainId: 1,
    verifyingContract: "0xPTON" as `0x${string}`,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TopupView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the top-up form with an amount input", () => {
    render(<TopupView />);
    expect(screen.getByPlaceholderText(/amount/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Get Quote/i })).toBeTruthy();
  });

  it("disables Get Quote button when amount is empty", () => {
    render(<TopupView />);
    const btn = screen.getByRole("button", { name: /Get Quote/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("fetches quote on Get Quote click", async () => {
    const fetchMock = mockFetch(QUOTE_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);

    render(<TopupView />);

    const input = screen.getByPlaceholderText(/amount/i);
    fireEvent.change(input, { target: { value: "10" } });

    const btn = screen.getByRole("button", { name: /Get Quote/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/v1/topup/quote",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows quote details after successful quote fetch", async () => {
    vi.stubGlobal("fetch", mockFetch(QUOTE_RESPONSE));

    render(<TopupView />);

    const input = screen.getByPlaceholderText(/amount/i);
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Get Quote/i }));

    await waitFor(() => {
      // Amount should be visible in the quote panel
      expect(screen.getByText(/10\.0000/)).toBeTruthy();
    });
  });

  it("shows error from quote API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Amount too small." }),
      }),
    );

    render(<TopupView />);

    const input = screen.getByPlaceholderText(/amount/i);
    fireEvent.change(input, { target: { value: "0.001" } });
    fireEvent.click(screen.getByRole("button", { name: /Get Quote/i }));

    await waitFor(() => {
      expect(screen.getByText("Amount too small.")).toBeTruthy();
    });
  });

  it("shows an error when no wallet is available for signing", async () => {
    // No window.ethereum — getEthersSigner will fail
    const origEthereum = (window as Window & { ethereum?: unknown }).ethereum;
    delete (window as Window & { ethereum?: unknown }).ethereum;

    vi.stubGlobal("fetch", mockFetch(QUOTE_RESPONSE));

    render(<TopupView />);

    const input = screen.getByPlaceholderText(/amount/i);
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Get Quote/i }));

    await waitFor(() => {
      // Quote visible
      expect(screen.queryByText(/Sign & Settle/i)).toBeTruthy();
    });

    const signBtn = screen.getByRole("button", { name: /Sign & Settle/i });
    fireEvent.click(signBtn);

    await waitFor(() => {
      // Some wallet error should appear
      expect(
        screen.getByText(/wallet|provider|ethereum/i),
      ).toBeTruthy();
    });

    // Restore
    if (origEthereum !== undefined) {
      (window as Window & { ethereum?: unknown }).ethereum = origEthereum;
    }
  });
});
