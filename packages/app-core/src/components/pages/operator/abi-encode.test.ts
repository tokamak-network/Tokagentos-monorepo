/**
 * Golden-vector tests for the operator x402 ABI encoders.
 *
 * Two classes of assertions:
 *   1. Spec-verifiable ERC-20 calldata (approve/deposit/balanceOf/allowance +
 *      vaultCredits/swapToTON): selector + 32-byte-padded args, checkable by
 *      hand against the standard ABI.
 *   2. Byte-for-byte parity with the mainnet-proven dashboard `app.js` for the
 *      dynamic encoders (encUniV3Path / encQuoteExactInput / encExactInput /
 *      encBridgeDepositERC20To). The expected hex below was produced by running
 *      app.js's own `_buildV3Path` / `_encQuoteExactInput` / `_encExactInput`
 *      and `depositERC20To` builder for the sample inputs — so these tests fail
 *      if the port ever drifts from the source of truth.
 *
 * Runner: vitest (repo standard — `vitest run`).
 */

import { describe, expect, it } from "vitest";
import {
  encAddr,
  encAllowance,
  encApprove,
  encBalanceOf,
  encBridgeDepositERC20To,
  encBytesTail,
  encDeposit,
  encExactInput,
  encQuoteExactInput,
  encUint,
  encUniV3Path,
  encVaultCredits,
  encWtonSwapToTON,
  pad32,
  SELECTORS,
} from "./abi-encode";

// --- Sample inputs (shared with the app.js trace that produced the goldens) ---
const RECIP = "0x1111111111111111111111111111111111111111";
const L1_TON = "0x2be5e8c109e2197D077D13A82dAead6a9b3433C5";
const L2_TON = "0x2222222222222222222222222222222222222222";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WTON = "0xc4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const ONE_USDC = 1_000_000n; // 1e6  (USDC, 6 decimals)
const ONE_TON = 1_000_000_000_000_000_000n; // 1e18 (TON, 18 decimals)
const ONE_WTON_RAY = 1_000_000_000_000_000_000_000_000_000n; // 1e27 (WTON ray)

describe("primitives", () => {
  it("pad32 left-pads hex, bigint, and number to 64 chars", () => {
    expect(pad32("0x1")).toBe("0".repeat(63) + "1");
    expect(pad32(255n)).toBe("0".repeat(62) + "ff");
    expect(pad32(0)).toBe("0".repeat(64));
    expect(pad32("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")).toBe(
      "000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    );
  });

  it("pad32 rejects oversize and negative values", () => {
    expect(() => pad32("0x" + "f".repeat(66))).toThrow();
    expect(() => pad32(-1n)).toThrow();
  });

  it("encUint and encAddr produce 32-byte words", () => {
    expect(encUint(ONE_USDC)).toBe(
      "00000000000000000000000000000000000000000000000000000000000f4240",
    );
    expect(encAddr(RECIP)).toBe(
      "0000000000000000000000001111111111111111111111111111111111111111",
    );
  });

  it("encBytesTail emits length word + 32-byte-aligned content", () => {
    // 2 bytes of data -> len=2, content right-padded to 64 hex chars.
    const t = encBytesTail("0xabcd");
    expect(t.len).toBe(
      "0000000000000000000000000000000000000000000000000000000000000002",
    );
    expect(t.content).toBe(
      "abcd000000000000000000000000000000000000000000000000000000000000",
    );
    // Empty bytes -> len=0, content="".
    const e = encBytesTail("0x");
    expect(e.len).toBe(
      "0000000000000000000000000000000000000000000000000000000000000000",
    );
    expect(e.content).toBe("");
  });
});

describe("selectors (keccak256(sig)[:4], app.js L862-869, L1293)", () => {
  it("match the audited 4-byte constants", () => {
    expect(SELECTORS.approve).toBe("095ea7b3");
    expect(SELECTORS.allowance).toBe("dd62ed3e");
    expect(SELECTORS.balanceOf).toBe("70a08231");
    expect(SELECTORS.vaultCredits).toBe("fe5ff468");
    expect(SELECTORS.ptonDeposit).toBe("b6b55f25");
    expect(SELECTORS.wtonSwapToTON).toBe("f53fe70f");
    expect(SELECTORS.quoteExactInput).toBe("cdca1753");
    expect(SELECTORS.exactInput).toBe("b858183f");
    expect(SELECTORS.bridgeDepositERC20To).toBe("838b2520");
  });
});

describe("standard ERC-20 / vault / WTON encoders (spec-verifiable)", () => {
  it("encApprove(spender, amount)", () => {
    expect(encApprove(RECIP, ONE_USDC)).toBe(
      "0x095ea7b3" +
        "0000000000000000000000001111111111111111111111111111111111111111" +
        "00000000000000000000000000000000000000000000000000000000000f4240",
    );
  });

  it("encAllowance(owner, spender)", () => {
    expect(encAllowance(RECIP, L1_TON)).toBe(
      "0xdd62ed3e" +
        "0000000000000000000000001111111111111111111111111111111111111111" +
        "0000000000000000000000002be5e8c109e2197d077d13a82daead6a9b3433c5",
    );
  });

  it("encBalanceOf(addr)", () => {
    expect(encBalanceOf(RECIP)).toBe(
      "0x70a08231" +
        "0000000000000000000000001111111111111111111111111111111111111111",
    );
  });

  it("encVaultCredits(addr) — ClaudeVault.credits(address)", () => {
    expect(encVaultCredits(RECIP)).toBe(
      "0xfe5ff468" +
        "0000000000000000000000001111111111111111111111111111111111111111",
    );
  });

  it("encDeposit(amount) — PTON.deposit(uint256)", () => {
    expect(encDeposit(ONE_TON)).toBe(
      "0xb6b55f25" +
        "0000000000000000000000000000000000000000000000000de0b6b3a7640000",
    );
  });

  it("encWtonSwapToTON(amountRay) — RAY units, not wei", () => {
    expect(encWtonSwapToTON(ONE_WTON_RAY)).toBe(
      "0xf53fe70f" +
        "0000000000000000000000000000000000000000033b2e3c9fd0803ce8000000",
    );
  });
});

describe("Uniswap V3 path packing (app.js _buildV3Path L899-910)", () => {
  it("packs token | uint24-fee | token | ... with 3-byte fees", () => {
    // USDC --500(0x0001f4)--> WETH --3000(0x000bb8)--> WTON
    const path = encUniV3Path(USDC, [
      { fee: 500, token: WETH },
      { fee: 3000, token: WTON },
    ]);
    expect(path).toBe(
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" + // USDC
        "0001f4" + // 500
        "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" + // WETH
        "000bb8" + // 3000
        "c4a11aaf6ea915ed7ac194161d2fc9384f15bff2", // WTON
    );
    // 20 + 3 + 20 + 3 + 20 = 66 bytes -> 132 hex chars + "0x".
    expect(path.length).toBe(2 + 132);
  });
});

describe("QuoterV2.quoteExactInput (app.js _encQuoteExactInput L927-940)", () => {
  it("byte-for-byte parity for USDC->WETH->WTON, 1 USDC in", () => {
    const path = encUniV3Path(USDC, [
      { fee: 500, token: WETH },
      { fee: 3000, token: WTON },
    ]);
    const expected =
      "0xcdca1753" +
      "0000000000000000000000000000000000000000000000000000000000000040" + // offset=0x40
      "00000000000000000000000000000000000000000000000000000000000f4240" + // amountIn=1e6
      "0000000000000000000000000000000000000000000000000000000000000042" + // bytes len=66
      "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480001f4c02aaa39b223fe8d0a0" +
      "e5c4f27ead9083c756cc2000bb8c4a11aaf6ea915ed7ac194161d2fc9384f15bf" +
      "f2000000000000000000000000000000000000000000000000000000000000"; // path + pad
    expect(encQuoteExactInput(path, ONE_USDC)).toBe(expected);
  });
});

describe("SwapRouter02.exactInput (app.js _encExactInput L949-961)", () => {
  it("byte-for-byte parity for the single-tuple struct arg", () => {
    const path = encUniV3Path(USDC, [
      { fee: 500, token: WETH },
      { fee: 3000, token: WTON },
    ]);
    const expected =
      "0xb858183f" +
      "0000000000000000000000000000000000000000000000000000000000000020" + // offset to struct = 0x20
      "0000000000000000000000000000000000000000000000000000000000000080" + // struct.bytes offset = 0x80
      "0000000000000000000000001111111111111111111111111111111111111111" + // recipient
      "00000000000000000000000000000000000000000000000000000000000f4240" + // amountIn=1e6
      "0000000000000000000000000000000000000000000000000000000000000000" + // amountOutMin=0
      "0000000000000000000000000000000000000000000000000000000000000042" + // bytes len=66
      "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480001f4c02aaa39b223fe8d0a0" +
      "e5c4f27ead9083c756cc2000bb8c4a11aaf6ea915ed7ac194161d2fc9384f15bf" +
      "f2000000000000000000000000000000000000000000000000000000000000";
    expect(
      encExactInput({
        path,
        recipient: RECIP,
        amountIn: ONE_USDC,
        amountOutMinimum: 0n,
      }),
    ).toBe(expected);
  });
});

describe("L1StandardBridge.depositERC20To (app.js L2049-2056)", () => {
  it("6 head words + empty-bytes tail (offset 0xc0, length 0)", () => {
    const expected =
      "0x838b2520" +
      "0000000000000000000000002be5e8c109e2197d077d13a82daead6a9b3433c5" + // _l1Token
      "0000000000000000000000002222222222222222222222222222222222222222" + // _l2Token
      "0000000000000000000000001111111111111111111111111111111111111111" + // _to
      "0000000000000000000000000000000000000000000000000de0b6b3a7640000" + // _amount=1e18
      "0000000000000000000000000000000000000000000000000000000000030d40" + // _minGasLimit=200000
      "00000000000000000000000000000000000000000000000000000000000000c0" + // _extraData offset=192
      "0000000000000000000000000000000000000000000000000000000000000000"; // _extraData length=0
    expect(
      encBridgeDepositERC20To(L1_TON, L2_TON, RECIP, ONE_TON, 200_000n),
    ).toBe(expected);
  });

  it("defaults extraData to empty bytes when omitted", () => {
    const withDefault = encBridgeDepositERC20To(
      L1_TON,
      L2_TON,
      RECIP,
      ONE_TON,
      200_000n,
    );
    const explicit = encBridgeDepositERC20To(
      L1_TON,
      L2_TON,
      RECIP,
      ONE_TON,
      200_000n,
      "0x",
    );
    expect(withDefault).toBe(explicit);
  });
});
