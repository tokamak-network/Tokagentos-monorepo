/**
 * API key store tests — CRUD + revocation edge cases.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createTestDb, type TestDbHandle } from "../../ledger/__tests__/db-harness.js";
import {
  mintApiKey,
  resolveApiKey,
  listApiKeys,
  revokeApiKey,
  bumpLastUsed,
} from "../api-keys.js";
import type { Address } from "viem";

const WALLET = "0xface000000000000000000000000000000000001" as Address;
const SECRET = "test-auth-secret-abcdef";

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

describe("mintApiKey()", () => {
  it("returns plaintext with sk-ai- prefix", async () => {
    const result = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "my-key",
      authSecret: SECRET,
    });
    expect(result.plaintext).toMatch(/^sk-ai-[0-9a-f]{64}$/);
    expect(result.id).toMatch(/^sk-ai-[0-9a-f]{8}$/);
  });

  it("two mints produce different keys", async () => {
    const a = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "key-a",
      authSecret: SECRET,
    });
    const b = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "key-b",
      authSecret: SECRET,
    });
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.id).not.toBe(b.id);
  });
});

describe("resolveApiKey()", () => {
  it("resolves a valid key to its wallet", async () => {
    const { plaintext } = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "resolve-test",
      authSecret: SECRET,
    });

    const identity = await resolveApiKey(handle.db, plaintext, SECRET);
    expect(identity).not.toBeNull();
    expect(identity!.wallet.toLowerCase()).toBe(WALLET.toLowerCase());
  });

  it("returns null for unknown key", async () => {
    const result = await resolveApiKey(
      handle.db,
      "sk-ai-" + "0".repeat(64),
      SECRET,
    );
    expect(result).toBeNull();
  });

  it("returns null for malformed key (no prefix)", async () => {
    const result = await resolveApiKey(handle.db, "bad-key-no-prefix", SECRET);
    expect(result).toBeNull();
  });

  it("returns null after revocation", async () => {
    const { plaintext, id } = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "revoke-then-resolve",
      authSecret: SECRET,
    });

    await revokeApiKey(handle.db, id, WALLET);

    const result = await resolveApiKey(handle.db, plaintext, SECRET);
    expect(result).toBeNull();
  });

  it("returns null when wrong secret used", async () => {
    const { plaintext } = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "wrong-secret",
      authSecret: SECRET,
    });
    const result = await resolveApiKey(handle.db, plaintext, "wrong-secret");
    expect(result).toBeNull();
  });
});

describe("listApiKeys()", () => {
  it("returns all keys for a wallet sorted newest first", async () => {
    const keys = await listApiKeys(handle.db, WALLET);
    // All keys minted above in this test file belong to WALLET
    expect(keys.length).toBeGreaterThanOrEqual(2);
    // Sorted descending
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        keys[i]!.createdAt.getTime(),
      );
    }
  });
});

describe("revokeApiKey()", () => {
  it("throws when key does not belong to wallet", async () => {
    const { id } = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "acl-test",
      authSecret: SECRET,
    });

    const otherWallet = "0x0000000000000000000000000000000000000001" as Address;
    await expect(revokeApiKey(handle.db, id, otherWallet)).rejects.toThrow(
      /does not belong/i,
    );
  });

  it("is idempotent — revoking already-revoked key does not throw", async () => {
    const { id } = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "idempotent-revoke",
      authSecret: SECRET,
    });
    await revokeApiKey(handle.db, id, WALLET);
    await expect(revokeApiKey(handle.db, id, WALLET)).resolves.toBeUndefined();
  });
});

describe("bumpLastUsed()", () => {
  it("updates last_used_at for the given ids", async () => {
    const { id } = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "bump-test",
      authSecret: SECRET,
    });

    const before = await listApiKeys(handle.db, WALLET);
    const keyBefore = before.find((k) => k.id === id);
    expect(keyBefore!.lastUsedAt).toBeNull();

    await bumpLastUsed(handle.db, [id]);

    const after = await listApiKeys(handle.db, WALLET);
    const keyAfter = after.find((k) => k.id === id);
    expect(keyAfter!.lastUsedAt).toBeInstanceOf(Date);
  });

  it("is a no-op for empty array", async () => {
    await expect(bumpLastUsed(handle.db, [])).resolves.toBeUndefined();
  });
});
