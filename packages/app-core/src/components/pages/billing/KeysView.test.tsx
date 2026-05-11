/**
 * Tests for KeysView
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { KeysView } from "./KeysView.js";

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

describe("KeysView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading skeleton on first render", () => {
    vi.stubGlobal("fetch", mockFetch({ keys: [] }));
    render(<KeysView />);
    const animatedPulse = document.querySelector(".animate-pulse");
    expect(animatedPulse).not.toBeNull();
  });

  it("renders active API keys after successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        keys: [
          {
            id: "key-1",
            name: "my-app",
            createdAt: "2026-01-01T00:00:00Z",
            lastUsedAt: null,
            revokedAt: null,
          },
        ],
      }),
    );

    render(<KeysView />);

    await waitFor(() => {
      expect(screen.getByText("my-app")).toBeTruthy();
    });
  });

  it("shows empty state when no active keys", async () => {
    vi.stubGlobal("fetch", mockFetch({ keys: [] }));

    render(<KeysView />);

    await waitFor(() => {
      expect(
        screen.getByText(/No active keys.*mint one above/),
      ).toBeTruthy();
    });
  });

  it("shows 401 error when not authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      }),
    );

    render(<KeysView />);

    await waitFor(() => {
      expect(screen.getByText("Sign in to manage API keys.")).toBeTruthy();
    });
  });

  it("displays newly minted key reveal panel", async () => {
    const fetchMock = vi
      .fn()
      // Initial keys fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ keys: [] }),
      })
      // POST /v1/keys — mint response
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: "new-key-id",
            key: "sk-ai-supersecretkey",
            name: "test-key",
            createdAt: "2026-01-01T00:00:00Z",
          }),
      })
      // Refresh after mint
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            keys: [
              {
                id: "new-key-id",
                name: "test-key",
                createdAt: "2026-01-01T00:00:00Z",
                lastUsedAt: null,
                revokedAt: null,
              },
            ],
          }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<KeysView />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText(/Key name/i);
      expect(input).toBeTruthy();
    });

    const input = screen.getByPlaceholderText(/Key name/i);
    fireEvent.change(input, { target: { value: "test-key" } });

    const mintButton = screen.getByRole("button", { name: /Mint Key/i });
    fireEvent.click(mintButton);

    await waitFor(() => {
      expect(screen.getByText("sk-ai-supersecretkey")).toBeTruthy();
    });
  });

  it("shows revoke confirmation buttons on click", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        keys: [
          {
            id: "key-1",
            name: "my-app",
            createdAt: "2026-01-01T00:00:00Z",
            lastUsedAt: null,
            revokedAt: null,
          },
        ],
      }),
    );

    render(<KeysView />);

    await waitFor(() => {
      expect(screen.getByText("my-app")).toBeTruthy();
    });

    const revokeBtn = screen.getByRole("button", { name: /Revoke/i });
    fireEvent.click(revokeBtn);

    expect(screen.getByText(/Revoke\?/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Yes, revoke/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeTruthy();
  });
});
