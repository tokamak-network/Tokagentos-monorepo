/**
 * Tests for the SIWE/JWT auth helpers in `auth/siwe.ts`.
 *
 * Covers:
 *   - JWT round-trip via `issueSession` → `verifySession`
 *   - Tampered payload rejection
 *   - Expired token rejection (negative TTL)
 *   - Wrong-secret rejection
 *   - `verifySIWESignature` happy path with viem `signTypedData`
 *   - Wrong-wallet rejection
 *   - Tampered envelope rejection
 *
 * Uses an Anvil-style fixture private key for deterministic signatures.
 */

import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { issueSession, verifySession, verifySIWESignature, SIWEAuthError, type SIWEEnvelope } from "../siwe.js";
import { LOGIN_AUTH_TYPES, loginAuthDomain } from "../../chain/typed-data.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Anvil's default account 0 — public, deterministic, safe in tests.
const FIXTURE_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const FIXTURE_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;

const SECRET = "test-jwt-secret-phase6a1";
const CHAIN_ID = 1;

// ---------------------------------------------------------------------------
// JWT session helpers
// ---------------------------------------------------------------------------

describe("issueSession + verifySession", () => {
  it("round-trips the wallet address (lowercased)", async () => {
    const token = await issueSession(FIXTURE_ADDRESS, SECRET, 60_000);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // header.payload.signature

    const result = await verifySession(token, SECRET);
    expect(result).not.toBeNull();
    // verifySession re-checksums to EIP-55, so equality is canonical form.
    expect(result!.wallet.toLowerCase()).toBe(FIXTURE_ADDRESS.toLowerCase());
  });

  it("returns null when a payload byte is tampered", async () => {
    const token = await issueSession(FIXTURE_ADDRESS, SECRET, 60_000);
    // The middle segment is the base64url payload — flip one char to corrupt.
    const parts = token.split(".");
    const payload = parts[1]!;
    const flipped = (payload[0] === "a" ? "b" : "a") + payload.slice(1);
    const tampered = [parts[0], flipped, parts[2]].join(".");

    const result = await verifySession(tampered, SECRET);
    expect(result).toBeNull();
  });

  it("returns null for an expired token", async () => {
    // Negative TTL → exp is already in the past at issue time.
    const token = await issueSession(FIXTURE_ADDRESS, SECRET, -1000);
    const result = await verifySession(token, SECRET);
    expect(result).toBeNull();
  });

  it("returns null when verified with a wrong secret", async () => {
    const token = await issueSession(FIXTURE_ADDRESS, SECRET, 60_000);
    const result = await verifySession(token, "different-secret");
    expect(result).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    const result = await verifySession("not.a.jwt", SECRET);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// EIP-712 SIWE envelope verification
// ---------------------------------------------------------------------------

describe("verifySIWESignature", () => {
  /** Build a SIWEEnvelope for a given wallet. */
  function makeEnvelope(wallet: Address): SIWEEnvelope {
    const now = Date.now();
    return {
      wallet,
      nonce: ("0x" + "ab".repeat(32)) as Hex,
      issuedAt: now,
      expiresAt: now + 300_000,
    };
  }

  /**
   * Sign an envelope with viem the same way the client would.
   * Mirrors the server-side `verifySIWESignature` typed-data shape:
   * `issuedAt`/`expiresAt` go in as BigInt seconds.
   */
  async function signEnvelope(
    envelope: SIWEEnvelope,
    chainId: number,
    pk: Hex,
  ): Promise<Hex> {
    const account = privateKeyToAccount(pk);
    return account.signTypedData({
      domain: loginAuthDomain(chainId),
      types: LOGIN_AUTH_TYPES,
      primaryType: "LoginAuth",
      message: {
        wallet: envelope.wallet,
        nonce: envelope.nonce,
        issuedAt: BigInt(Math.floor(envelope.issuedAt / 1000)),
        expiresAt: BigInt(Math.floor(envelope.expiresAt / 1000)),
      },
    });
  }

  it("succeeds for a correctly signed envelope", async () => {
    const envelope = makeEnvelope(FIXTURE_ADDRESS);
    const signature = await signEnvelope(envelope, CHAIN_ID, FIXTURE_PK);
    await expect(
      verifySIWESignature(envelope, signature, CHAIN_ID),
    ).resolves.toBeUndefined();
  });

  it("throws SIWEAuthError(401) when wallet in envelope does not match signer", async () => {
    const envelope = makeEnvelope(FIXTURE_ADDRESS);
    const signature = await signEnvelope(envelope, CHAIN_ID, FIXTURE_PK);

    // Replace the envelope's wallet with a different address — signature now
    // verifies against the wrong recovery candidate.
    const tampered: SIWEEnvelope = {
      ...envelope,
      wallet: "0x0000000000000000000000000000000000000001" as Address,
    };

    await expect(
      verifySIWESignature(tampered, signature, CHAIN_ID),
    ).rejects.toBeInstanceOf(SIWEAuthError);
  });

  it("throws SIWEAuthError(401) when the envelope is tampered after signing", async () => {
    const envelope = makeEnvelope(FIXTURE_ADDRESS);
    const signature = await signEnvelope(envelope, CHAIN_ID, FIXTURE_PK);

    // Mutate the nonce — signature no longer matches the typed-data digest.
    const tampered: SIWEEnvelope = {
      ...envelope,
      nonce: ("0x" + "cd".repeat(32)) as Hex,
    };

    await expect(
      verifySIWESignature(tampered, signature, CHAIN_ID),
    ).rejects.toMatchObject({
      name: "SIWEAuthError",
      status: 401,
    });
  });

  it("throws SIWEAuthError(401) when chainId in domain differs from sign time", async () => {
    const envelope = makeEnvelope(FIXTURE_ADDRESS);
    const signature = await signEnvelope(envelope, CHAIN_ID, FIXTURE_PK);

    // Verify against a different chainId — domain separator differs, so
    // the digest used by verifyTypedData no longer matches the signature.
    await expect(
      verifySIWESignature(envelope, signature, CHAIN_ID + 1),
    ).rejects.toBeInstanceOf(SIWEAuthError);
  });
});
