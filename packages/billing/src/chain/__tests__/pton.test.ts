/**
 * Unit tests for chain/pton.ts and chain/typed-data.ts.
 *
 * These tests are ALWAYS run — no anvil node required.
 * All signature operations use viem's offline typed-data functions with the
 * standard Anvil default key #0 as the fixture signer.
 */
import { describe, it, expect } from "vitest";
import { signTypedData } from "viem/accounts";
import { privateKeyToAccount } from "viem/accounts";
import {
  verifyEip3009Signature,
  type PaymentAuthorization,
  type PaymentSignature,
} from "../pton.js";
import {
  TRANSFER_WITH_AUTH_TYPES,
  LOGIN_AUTH_TYPES,
  ptonDomain,
  loginAuthDomain,
} from "../typed-data.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Anvil default account #0. Safe to use in tests — publicly known key. */
const ANVIL_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const FIXTURE_SIGNER = privateKeyToAccount(ANVIL_PRIVATE_KEY);

/**
 * A second key (account #1) for "wrong signer" tests.
 * Also a well-known Anvil default key — not a secret.
 */
const WRONG_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const FIXTURE_PAYER = FIXTURE_SIGNER.address;
const FIXTURE_VAULT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const; // Anvil #1
const FIXTURE_CHAIN_ID = 1;
const FIXTURE_PTON_ADDRESS = "0x1aa43c68e7e9cf1669eccf5f8f704f766128d466" as const;

const FIXTURE_AUTH: PaymentAuthorization = {
  from: FIXTURE_PAYER,
  to: FIXTURE_VAULT,
  value: 1_000_000_000_000_000_000n, // 1 PTON (1e18 for test; actual is 1e27)
  validAfter: 0n,
  validBefore: 9_999_999_999n,
  nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
};

/**
 * Sign a TransferWithAuthorization message offline with the fixture key.
 */
async function signAuth(
  auth: PaymentAuthorization,
  privateKey: `0x${string}` = ANVIL_PRIVATE_KEY,
): Promise<PaymentSignature> {
  const sigHex = await signTypedData({
    privateKey,
    domain: ptonDomain(FIXTURE_CHAIN_ID, FIXTURE_PTON_ADDRESS),
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: auth.from,
      to: auth.to,
      value: auth.value,
      validAfter: auth.validAfter,
      validBefore: auth.validBefore,
      nonce: auth.nonce,
    },
  });

  // sigHex is a 65-byte concatenated hex: r (32) + s (32) + v (1)
  const r = ("0x" + sigHex.slice(2, 66)) as `0x${string}`;
  const s = ("0x" + sigHex.slice(66, 130)) as `0x${string}`;
  const v = parseInt(sigHex.slice(130, 132), 16);
  return { r, s, v };
}

// ---------------------------------------------------------------------------
// Tests: verifyEip3009Signature
// ---------------------------------------------------------------------------

describe("verifyEip3009Signature", () => {
  it("returns true for a valid signature from the expected signer", async () => {
    const sig = await signAuth(FIXTURE_AUTH);
    const result = await verifyEip3009Signature({
      auth: FIXTURE_AUTH,
      sig,
      chainId: FIXTURE_CHAIN_ID,
      ptonAddress: FIXTURE_PTON_ADDRESS,
    });
    expect(result).toBe(true);
  });

  it("returns false when the signature was produced by a different key", async () => {
    // Signed by account #1, claimed to be from account #0
    const sig = await signAuth(FIXTURE_AUTH, WRONG_PRIVATE_KEY);
    const result = await verifyEip3009Signature({
      auth: FIXTURE_AUTH,
      sig,
      chainId: FIXTURE_CHAIN_ID,
      ptonAddress: FIXTURE_PTON_ADDRESS,
    });
    expect(result).toBe(false);
  });

  it("returns false when the value in the auth does not match the signed message", async () => {
    const sig = await signAuth(FIXTURE_AUTH);
    // Tamper: change value after signing
    const tamperedAuth: PaymentAuthorization = {
      ...FIXTURE_AUTH,
      value: FIXTURE_AUTH.value + 1n,
    };
    const result = await verifyEip3009Signature({
      auth: tamperedAuth,
      sig,
      chainId: FIXTURE_CHAIN_ID,
      ptonAddress: FIXTURE_PTON_ADDRESS,
    });
    expect(result).toBe(false);
  });

  it("returns false when the domain chainId does not match the signed message", async () => {
    const sig = await signAuth(FIXTURE_AUTH); // signed with chainId=1
    const result = await verifyEip3009Signature({
      auth: FIXTURE_AUTH,
      sig,
      chainId: 137, // wrong chain
      ptonAddress: FIXTURE_PTON_ADDRESS,
    });
    expect(result).toBe(false);
  });

  it("returns false when the ptonAddress (verifyingContract) does not match", async () => {
    const sig = await signAuth(FIXTURE_AUTH);
    const result = await verifyEip3009Signature({
      auth: FIXTURE_AUTH,
      sig,
      chainId: FIXTURE_CHAIN_ID,
      ptonAddress: "0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000", // wrong contract
    });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: ptonDomain
// ---------------------------------------------------------------------------

describe("ptonDomain", () => {
  it("returns an EIP-712 domain with name=PTON, version=1", () => {
    const domain = ptonDomain(1, FIXTURE_PTON_ADDRESS);
    expect(domain).toEqual({
      name: "PTON",
      version: "1",
      chainId: 1,
      verifyingContract: FIXTURE_PTON_ADDRESS,
    });
  });

  it("uses the supplied chainId", () => {
    const domain = ptonDomain(137, FIXTURE_PTON_ADDRESS);
    expect(domain.chainId).toBe(137);
  });

  it("uses the supplied ptonAddress as verifyingContract", () => {
    const addr = "0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000" as const;
    const domain = ptonDomain(1, addr);
    expect(domain.verifyingContract).toBe(addr);
  });
});

// ---------------------------------------------------------------------------
// Tests: loginAuthDomain
// ---------------------------------------------------------------------------

describe("loginAuthDomain", () => {
  it("returns name=ai-proxy, version=1, no verifyingContract", () => {
    const domain = loginAuthDomain(1);
    expect(domain).toEqual({
      name: "ai-proxy",
      version: "1",
      chainId: 1,
    });
    // No verifyingContract — this signature has no on-chain meaning.
    expect(domain).not.toHaveProperty("verifyingContract");
  });

  it("uses the supplied chainId", () => {
    const domain = loginAuthDomain(137);
    expect(domain.chainId).toBe(137);
  });
});

// ---------------------------------------------------------------------------
// Tests: typed-data shape validation
// ---------------------------------------------------------------------------

describe("TRANSFER_WITH_AUTH_TYPES", () => {
  it("has the correct field list for TransferWithAuthorization", () => {
    const fields = TRANSFER_WITH_AUTH_TYPES.TransferWithAuthorization;
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

describe("LOGIN_AUTH_TYPES", () => {
  it("has the correct field list for LoginAuth", () => {
    const fields = LOGIN_AUTH_TYPES.LoginAuth;
    const names = fields.map((f) => f.name);
    expect(names).toEqual(["wallet", "nonce", "issuedAt", "expiresAt"]);
  });
});
