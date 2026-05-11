/**
 * Pre-signed authorization (preauth) slot store tests.
 * Covers the 4-state machine: available → consumed / poisoned / expired.
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDbHandle } from "./db-harness.js";
import { topupPreauthSlots } from "../schema.js";
import {
  depositPreauthSlot,
  nextAvailableSlot,
  markConsumed,
  markPoisoned,
  sweepExpired,
} from "../preauth.js";
import type { Address, Hex } from "viem";

const WALLET = "0xdead000000000000000000000000000000000001" as Address;

const makeSlot = (nonce: string, validAfterOffset = -1000, validBeforeOffset = 60_000) => ({
  wallet: WALLET,
  nonce: nonce as Hex,
  amountPton: 100_000n,
  validAfter: new Date(Date.now() + validAfterOffset),
  validBefore: new Date(Date.now() + validBeforeOffset),
  v: 28,
  r: ("0x" + "a".repeat(64)) as Hex,
  s: ("0x" + "b".repeat(64)) as Hex,
});

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db
    .delete(topupPreauthSlots)
    .where(eq(topupPreauthSlots.wallet, WALLET.toLowerCase()));
});

afterEach(async () => {
  await handle.db
    .delete(topupPreauthSlots)
    .where(eq(topupPreauthSlots.wallet, WALLET.toLowerCase()));
});

describe("depositPreauthSlot()", () => {
  it("stores a slot in 'available' state", async () => {
    await depositPreauthSlot(handle.db, makeSlot("0xnonce001"));

    const rows = await handle.db
      .select()
      .from(topupPreauthSlots)
      .where(eq(topupPreauthSlots.wallet, WALLET.toLowerCase()));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("available");
    expect(rows[0]!.amountPton).toBe(100_000n);
  });

  it("rejects duplicate (wallet, nonce) pair", async () => {
    await depositPreauthSlot(handle.db, makeSlot("0xdupe001"));
    await expect(
      depositPreauthSlot(handle.db, makeSlot("0xdupe001")),
    ).rejects.toThrow();
  });
});

describe("nextAvailableSlot()", () => {
  it("returns null when no slots exist", async () => {
    const slot = await nextAvailableSlot(handle.db, WALLET, new Date());
    expect(slot).toBeNull();
  });

  it("returns the earliest-expiring available slot", async () => {
    // Two slots: one expires sooner (should be picked first)
    await depositPreauthSlot(handle.db, {
      ...makeSlot("0xslot-far", -1000, 120_000),
    });
    await depositPreauthSlot(handle.db, {
      ...makeSlot("0xslot-near", -1000, 30_000),
    });

    const slot = await nextAvailableSlot(handle.db, WALLET, new Date());
    expect(slot).not.toBeNull();
    expect(slot!.nonce).toBe("0xslot-near");
  });

  it("skips slots not yet valid (validAfter in future)", async () => {
    await depositPreauthSlot(handle.db, makeSlot("0xfuture", 60_000, 120_000)); // validAfter is in future
    const slot = await nextAvailableSlot(handle.db, WALLET, new Date());
    expect(slot).toBeNull();
  });

  it("skips slots that have already expired", async () => {
    await depositPreauthSlot(
      handle.db,
      makeSlot("0xexpired", -60_000, -1000), // validBefore in past
    );
    const slot = await nextAvailableSlot(handle.db, WALLET, new Date());
    expect(slot).toBeNull();
  });
});

describe("markConsumed()", () => {
  it("transitions available → consumed", async () => {
    await depositPreauthSlot(handle.db, makeSlot("0xcons001"));
    await markConsumed(handle.db, WALLET, "0xcons001" as Hex);

    const rows = await handle.db
      .select({ state: topupPreauthSlots.state })
      .from(topupPreauthSlots)
      .where(eq(topupPreauthSlots.wallet, WALLET.toLowerCase()));

    expect(rows[0]!.state).toBe("consumed");
  });

  it("consumed slot is not returned by nextAvailableSlot", async () => {
    await depositPreauthSlot(handle.db, makeSlot("0xcons002"));
    await markConsumed(handle.db, WALLET, "0xcons002" as Hex);

    const slot = await nextAvailableSlot(handle.db, WALLET, new Date());
    expect(slot).toBeNull();
  });

  it("throws when called on a slot that is already poisoned", async () => {
    await depositPreauthSlot(handle.db, makeSlot("0xcons-poi"));
    await markPoisoned(handle.db, WALLET, "0xcons-poi" as Hex);

    await expect(
      markConsumed(handle.db, WALLET, "0xcons-poi" as Hex),
    ).rejects.toThrow(/not available for transition/);

    // State remains poisoned (no silent overwrite)
    const rows = await handle.db
      .select({ state: topupPreauthSlots.state })
      .from(topupPreauthSlots)
      .where(eq(topupPreauthSlots.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.state).toBe("poisoned");
  });

  it("throws when called on an unknown (wallet, nonce) pair", async () => {
    await expect(
      markConsumed(handle.db, WALLET, "0xnoexist" as Hex),
    ).rejects.toThrow(/not available for transition/);
  });
});

describe("markPoisoned()", () => {
  it("transitions available → poisoned", async () => {
    await depositPreauthSlot(handle.db, makeSlot("0xpoi001"));
    await markPoisoned(handle.db, WALLET, "0xpoi001" as Hex);

    const rows = await handle.db
      .select({ state: topupPreauthSlots.state })
      .from(topupPreauthSlots)
      .where(eq(topupPreauthSlots.wallet, WALLET.toLowerCase()));

    expect(rows[0]!.state).toBe("poisoned");
  });

  it("poisoned slot is not returned by nextAvailableSlot", async () => {
    await depositPreauthSlot(handle.db, makeSlot("0xpoi002"));
    await markPoisoned(handle.db, WALLET, "0xpoi002" as Hex);

    const slot = await nextAvailableSlot(handle.db, WALLET, new Date());
    expect(slot).toBeNull();
  });

  it("throws when called on a slot that is already consumed", async () => {
    await depositPreauthSlot(handle.db, makeSlot("0xpoi-cons"));
    await markConsumed(handle.db, WALLET, "0xpoi-cons" as Hex);

    await expect(
      markPoisoned(handle.db, WALLET, "0xpoi-cons" as Hex),
    ).rejects.toThrow(/not available for transition/);

    // State remains consumed (no silent overwrite)
    const rows = await handle.db
      .select({ state: topupPreauthSlots.state })
      .from(topupPreauthSlots)
      .where(eq(topupPreauthSlots.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.state).toBe("consumed");
  });
});

describe("sweepExpired()", () => {
  it("marks expired available slots and returns count", async () => {
    // One expired, one valid
    await depositPreauthSlot(handle.db, makeSlot("0xexp-a", -120_000, -1000)); // expired
    await depositPreauthSlot(handle.db, makeSlot("0xexp-b", -1000, 60_000)); // valid

    const count = await sweepExpired(handle.db, new Date());
    expect(count).toBe(1);

    const rows = await handle.db
      .select({ state: topupPreauthSlots.state, nonce: topupPreauthSlots.nonce })
      .from(topupPreauthSlots)
      .where(eq(topupPreauthSlots.wallet, WALLET.toLowerCase()));

    const expired = rows.find((r) => r.nonce === "0xexp-a");
    const valid = rows.find((r) => r.nonce === "0xexp-b");
    expect(expired!.state).toBe("expired");
    expect(valid!.state).toBe("available");
  });

  it("does not sweep already-consumed or poisoned slots", async () => {
    await depositPreauthSlot(handle.db, makeSlot("0xcons-exp", -120_000, -1000));
    await markConsumed(handle.db, WALLET, "0xcons-exp" as Hex);

    const count = await sweepExpired(handle.db, new Date());
    expect(count).toBe(0);

    const rows = await handle.db
      .select({ state: topupPreauthSlots.state })
      .from(topupPreauthSlots)
      .where(eq(topupPreauthSlots.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.state).toBe("consumed"); // unchanged
  });
});
