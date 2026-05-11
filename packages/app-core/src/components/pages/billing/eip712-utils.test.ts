/**
 * Tests for eip712-utils.ts
 */

import { describe, expect, it } from "vitest";
import {
  buildTransferWithAuthMessage,
  decomposeSignature,
  formatAttoPton,
  topupIdToNonce,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
} from "./eip712-utils.js";

// ---------------------------------------------------------------------------
// decomposeSignature
// ---------------------------------------------------------------------------

describe("decomposeSignature", () => {
  it("decomposes a valid 65-byte signature", () => {
    const r = "a".repeat(64);
    const s = "b".repeat(64);
    const v = "1c"; // 28
    const hex = `0x${r}${s}${v}`;
    const result = decomposeSignature(hex);
    expect(result.r).toBe(`0x${r}`);
    expect(result.s).toBe(`0x${s}`);
    expect(result.v).toBe(28);
  });

  it("throws on a signature that is too short", () => {
    expect(() => decomposeSignature("0xabcd")).toThrow("Invalid signature");
  });

  it("throws on a signature missing 0x prefix", () => {
    const hex = "a".repeat(130);
    expect(() => decomposeSignature(hex)).toThrow("Invalid signature");
  });

  it("extracts v=27 correctly", () => {
    const hex = `0x${"0".repeat(128)}1b`;
    const result = decomposeSignature(hex);
    expect(result.v).toBe(27);
  });
});

// ---------------------------------------------------------------------------
// topupIdToNonce
// ---------------------------------------------------------------------------

describe("topupIdToNonce", () => {
  it("converts a UUID to a zero-padded 32-byte hex string", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const nonce = topupIdToNonce(uuid);
    expect(nonce.startsWith("0x")).toBe(true);
    expect(nonce.length).toBe(66); // "0x" + 64 hex chars
    const stripped = nonce.slice(2);
    expect(stripped).toMatch(/^0+550e8400e29b41d4a716446655440000$/);
  });

  it("produces a 64-char hex body after 0x prefix", () => {
    const nonce = topupIdToNonce("00000000-0000-0000-0000-000000000001");
    expect(nonce.length).toBe(66);
    expect(nonce).toBe("0x" + "0".repeat(62) + "01");
  });
});

// ---------------------------------------------------------------------------
// buildTransferWithAuthMessage
// ---------------------------------------------------------------------------

describe("buildTransferWithAuthMessage", () => {
  it("builds a correctly shaped EIP-3009 message", () => {
    const nonceHex = `0x${"0".repeat(62)}01` as `0x${string}`;
    const args = {
      from: "0xabc000" as `0x${string}`,
      to: "0xdef000" as `0x${string}`,
      valueAttoPton: BigInt("1000000000000000000"),
      validAfterUnix: 0,
      validBeforeUnix: 9999999999,
      nonceHex,
    };
    const msg = buildTransferWithAuthMessage(args);
    expect(msg.from).toBe(args.from);
    expect(msg.to).toBe(args.to);
    expect(msg.value).toBe("1000000000000000000");
    expect(msg.validAfter).toBe(0);
    expect(msg.validBefore).toBe(9999999999);
    expect(msg.nonce).toBe(nonceHex);
  });

  it("serialises value as a string (not a bigint)", () => {
    const msg = buildTransferWithAuthMessage({
      from: "0x1" as `0x${string}`,
      to: "0x2" as `0x${string}`,
      valueAttoPton: BigInt("999"),
      validAfterUnix: 0,
      validBeforeUnix: 1,
      nonceHex: `0x${"0".repeat(64)}` as `0x${string}`,
    });
    expect(typeof msg.value).toBe("string");
    expect(msg.value).toBe("999");
  });
});

// ---------------------------------------------------------------------------
// TRANSFER_WITH_AUTHORIZATION_TYPES
// ---------------------------------------------------------------------------

describe("TRANSFER_WITH_AUTHORIZATION_TYPES", () => {
  it("contains the correct EIP-712 type fields", () => {
    const fields = TRANSFER_WITH_AUTHORIZATION_TYPES.TransferWithAuthorization;
    const names = fields.map((f) => f.name);
    expect(names).toEqual([
      "from",
      "to",
      "value",
      "validAfter",
      "validBefore",
      "nonce",
    ]);
  });
});

// ---------------------------------------------------------------------------
// formatAttoPton
// ---------------------------------------------------------------------------

describe("formatAttoPton", () => {
  it("formats 1 PTON as '1.0000'", () => {
    expect(formatAttoPton(BigInt("1000000000000000000"))).toBe("1.0000");
  });

  it("formats 0 as '0.0000'", () => {
    expect(formatAttoPton(BigInt(0))).toBe("0.0000");
  });

  it("formats 1.5 PTON correctly", () => {
    expect(formatAttoPton(BigInt("1500000000000000000"))).toBe("1.5000");
  });

  it("formats fractional amounts with 4 decimal places", () => {
    // 0.0001 PTON = 1e14 attoPTON
    expect(formatAttoPton(BigInt("100000000000000"))).toBe("0.0001");
  });

  it("pads fractional digits with leading zeros", () => {
    // 1.0010 PTON
    expect(formatAttoPton(BigInt("1001000000000000000"))).toBe("1.0010");
  });
});
