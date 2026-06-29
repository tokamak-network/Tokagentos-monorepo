/**
 * Low-level, dependency-free ABI calldata encoders for the operator x402 flows.
 *
 * SELF-CONTAINED: imports nothing. No ethers, no @tokagentos/@tokagent, no
 * app-core internals. Every byte produced here is a VERBATIM port of the
 * mainnet-proven hand-rolled encoders in the billing dashboard `app.js`
 * (≈ L836-962). Line citations below point at that source of truth:
 *   packages/tokagentos/templates/fullstack-app/plugins/plugin-tokagent-billing/
 *     src/dashboard/app.js
 *
 * Why hand-rolled (not ethers): the dashboard ships as a single vanilla JS file
 * with zero deps, so it cannot pull in keccak. Every selector we need is
 * well-known and hard-coded as a 4-byte constant (audited against
 * 4byte.directory AND re-verified here against keccak256 of the canonical
 * signature). The encoders below reproduce the exact word layout the mainnet
 * dashboard sends, so swaps/bridges/deposits behave byte-for-byte identically.
 */

// ---------------------------------------------------------------------------
// 4-byte function selectors (app.js L862-869, L1293).
// Each is keccak256(signature)[:4]; verified in abi-encode.test.ts.
// ---------------------------------------------------------------------------

export const SELECTORS = {
  /** approve(address,uint256) — app.js L862 */
  approve: "095ea7b3",
  /** allowance(address,address) — app.js L863 */
  allowance: "dd62ed3e",
  /** balanceOf(address) — app.js L864 */
  balanceOf: "70a08231",
  /** ClaudeVault.credits(address) — app.js L1293-1294 (`0xfe5ff468`) */
  vaultCredits: "fe5ff468",
  /** PTON.deposit(uint256) — app.js L865 */
  ptonDeposit: "b6b55f25",
  /** WTON.swapToTON(uint256) — app.js L866 */
  wtonSwapToTON: "f53fe70f",
  /** QuoterV2.quoteExactInput(bytes,uint256) — app.js L868 */
  quoteExactInput: "cdca1753",
  /** SwapRouter02.exactInput((bytes,address,uint256,uint256)) — app.js L867 */
  exactInput: "b858183f",
  /** L1StandardBridge.depositERC20To(address,address,address,uint256,uint32,bytes) — app.js L869 */
  bridgeDepositERC20To: "838b2520",
} as const;

// ---------------------------------------------------------------------------
// Primitive word helpers (app.js L838-858, L915-921).
// ---------------------------------------------------------------------------

/** Strip `0x`, lowercase. Returns "" for falsy. (app.js L839-842, `_stripHex`) */
function stripHex(h: string | bigint | number | null | undefined): string {
  if (h === null || h === undefined || h === "") return "";
  return String(h).replace(/^0x/i, "").toLowerCase();
}

/**
 * Left-pad a hex string or bigint to 32 bytes (64 hex chars, no `0x`).
 * (app.js L844-848, `_pad32` — accepts the value as hex or bigint here so a
 * single helper covers both `_pad32(hex)` and `_encUint(bigint)`.)
 */
export function pad32(hexOrBigInt: string | bigint | number): string {
  let clean: string;
  if (typeof hexOrBigInt === "bigint") {
    if (hexOrBigInt < 0n) throw new Error("pad32: negative");
    clean = hexOrBigInt.toString(16);
  } else if (typeof hexOrBigInt === "number") {
    if (!Number.isInteger(hexOrBigInt) || hexOrBigInt < 0) {
      throw new Error("pad32: non-integer/negative number");
    }
    clean = hexOrBigInt.toString(16);
  } else {
    clean = stripHex(hexOrBigInt);
  }
  if (clean.length > 64) {
    throw new Error(`pad32: value too large (${clean.length} hex chars)`);
  }
  return clean.padStart(64, "0");
}

/** uint256 → 32-byte hex word (no `0x`). (app.js L850-854, `_encUint`) */
export function encUint(n: bigint | number | string): string {
  const big = typeof n === "bigint" ? n : BigInt(n);
  if (big < 0n) throw new Error("encUint: negative");
  return pad32(big.toString(16));
}

/** address → 32-byte hex word (lower 40 hex, left-padded). (app.js L856-858, `_encAddr`) */
export function encAddr(addr: string): string {
  return pad32(stripHex(addr));
}

/**
 * Encode a dynamic `bytes` param into its length + 32-byte-aligned content.
 * The CALLER manages the containing header (offset words). (app.js L915-921,
 * `_encBytes`.)
 *
 * @returns `{ len, content }` — `len` is the 32-byte length word, `content` is
 *   the hex payload right-padded to a 32-byte boundary. Both are `0x`-free.
 */
export function encBytesTail(hexBytes: string): {
  len: string;
  content: string;
} {
  const clean = stripHex(hexBytes);
  const len = encUint(BigInt(clean.length / 2));
  // Pad to a 32-byte (64-hex-char) boundary. (app.js L919)
  const padded = clean + "0".repeat((64 - (clean.length % 64)) % 64);
  return { len, content: padded };
}

// ---------------------------------------------------------------------------
// High-level calldata encoders — each returns a `0x`-prefixed payload ready to
// drop into an eth_sendTransaction / eth_call `data` field.
// ---------------------------------------------------------------------------

/** ERC-20 approve(spender, amount). (app.js L1037, L1041) */
export function encApprove(spender: string, amount: bigint): string {
  return "0x" + SELECTORS.approve + encAddr(spender) + encUint(amount);
}

/** ERC-20 allowance(owner, spender). (app.js L968) */
export function encAllowance(owner: string, spender: string): string {
  return "0x" + SELECTORS.allowance + encAddr(owner) + encAddr(spender);
}

/** ERC-20 balanceOf(addr). (app.js L975, L2061) */
export function encBalanceOf(addr: string): string {
  return "0x" + SELECTORS.balanceOf + encAddr(addr);
}

/** ClaudeVault.credits(addr). (app.js L1292-1294) */
export function encVaultCredits(addr: string): string {
  return "0x" + SELECTORS.vaultCredits + encAddr(addr);
}

/** PTON.deposit(amount) — wraps TON → PTON. (app.js L1199) */
export function encDeposit(amount: bigint): string {
  return "0x" + SELECTORS.ptonDeposit + encUint(amount);
}

/**
 * WTON.swapToTON(amountRay) — burns `amountRay` WTON (27 decimals / ray) and
 * mints `amountRay / 1e9` TON wei. The arg is in RAY units (NOT wei). (app.js
 * L820, L1180.)
 */
export function encWtonSwapToTON(amountRay: bigint): string {
  return "0x" + SELECTORS.wtonSwapToTON + encUint(amountRay);
}

/**
 * A single Uniswap V3 path leg: a fee tier (uint24, in hundredths-of-a-bip)
 * followed by the next token address.
 */
export interface UniV3Leg {
  /** uint24 pool fee, e.g. 500 (0.05%), 3000 (0.3%). */
  fee: number;
  /** Next token in the path. */
  token: string;
}

/**
 * Pack a Uniswap V3 path: `tokenA | fee0 | tokenB | fee1 | tokenC | ...`
 * where each fee is a 3-byte (uint24) big-endian value between tokens.
 * (app.js L899-910, `_buildV3Path` — here the first token is explicit and
 * subsequent `(fee, token)` legs follow.)
 *
 * @param firstToken the input token (path head)
 * @param legs ordered `{ fee, token }` hops after the head
 * @returns `0x`-prefixed packed path bytes
 */
export function encUniV3Path(firstToken: string, legs: UniV3Leg[]): string {
  if (!Array.isArray(legs) || legs.length < 1) {
    throw new Error("path needs >= 1 leg (>= 2 tokens total)");
  }
  let out = stripHex(firstToken);
  for (let i = 0; i < legs.length; i++) {
    const h = legs[i];
    if (typeof h.fee !== "number") throw new Error(`leg ${i} missing fee`);
    // uint24 = 3 bytes = 6 hex chars. (app.js L906)
    out += h.fee.toString(16).padStart(6, "0");
    out += stripHex(h.token);
  }
  return "0x" + out;
}

/**
 * QuoterV2.quoteExactInput(bytes path, uint256 amountIn). MUST be invoked via
 * eth_call (the quoter mutates storage with a simulated swap, discarded inside
 * eth_call). Returns (amountOut, ...) — read the first 32 bytes for amountOut.
 *
 * Word layout after the 4-byte selector (app.js L927-940, `_encQuoteExactInput`):
 *   word 0: offset to `bytes path` = 0x40 (64 = two words ahead)
 *   word 1: amountIn
 *   word 2: bytes length
 *   word 3+: padded bytes
 */
export function encQuoteExactInput(pathHex: string, amountIn: bigint): string {
  const b = encBytesTail(pathHex);
  return (
    "0x" +
    SELECTORS.quoteExactInput +
    encUint(64n) +
    encUint(amountIn) +
    b.len +
    b.content
  );
}

/** Args for SwapRouter02.exactInput's single struct tuple. */
export interface ExactInputParams {
  /** Packed Uniswap V3 path bytes (`encUniV3Path` output). */
  path: string;
  /** Token recipient. */
  recipient: string;
  /** Exact input amount (in `tokenIn` smallest units). */
  amountIn: bigint;
  /** Minimum acceptable output (slippage floor). */
  amountOutMinimum: bigint;
}

/**
 * SwapRouter02.exactInput((bytes path, address recipient, uint256 amountIn,
 * uint256 amountOutMinimum)). The struct is dynamic (it contains `bytes`), so
 * the outer arg is passed by offset and the struct's `bytes` field is in turn
 * passed by an offset relative to the struct head.
 *
 * Word layout after the 4-byte selector (app.js L949-961, `_encExactInput`):
 *   word 0: offset to struct        = 0x20 (32)
 *   word 1: struct.bytes offset      = 0x80 (128 = 4 words into the struct)
 *   word 2: recipient
 *   word 3: amountIn
 *   word 4: amountOutMinimum
 *   word 5: bytes length
 *   word 6+: padded path bytes
 */
export function encExactInput(p: ExactInputParams): string {
  const b = encBytesTail(p.path);
  return (
    "0x" +
    SELECTORS.exactInput +
    encUint(32n) + // offset to struct
    encUint(128n) + // struct.bytes offset (within struct)
    encAddr(p.recipient) +
    encUint(p.amountIn) +
    encUint(p.amountOutMinimum) +
    b.len +
    b.content
  );
}

/**
 * L1StandardBridge.depositERC20To(_l1Token, _l2Token, _to, _amount,
 * _minGasLimit, _extraData). The trailing `bytes _extraData` is dynamic; with
 * the default empty value the layout is 6 head words then a length-0 tail.
 *
 * Word layout after the 4-byte selector (app.js L2049-2056):
 *   word 0: _l1Token
 *   word 1: _l2Token
 *   word 2: _to
 *   word 3: _amount
 *   word 4: _minGasLimit (uint32, right-aligned in a 32-byte word)
 *   word 5: offset to _extraData = 0xc0 (192 = 6 head words)
 *   word 6: _extraData length
 *   word 7+: _extraData content (padded; empty for the default "0x")
 */
export function encBridgeDepositERC20To(
  l1Token: string,
  l2Token: string,
  to: string,
  amount: bigint,
  minGasLimit: bigint,
  extraData: string = "0x",
): string {
  const tail = encBytesTail(extraData);
  // For the common empty-bytes case the content is "" — only the head + length
  // word are emitted, exactly matching app.js's `_encUint(192n) + _encUint(0n)`.
  return (
    "0x" +
    SELECTORS.bridgeDepositERC20To +
    encAddr(l1Token) +
    encAddr(l2Token) +
    encAddr(to) +
    encUint(amount) +
    encUint(minGasLimit) +
    encUint(192n) +
    tail.len +
    tail.content
  );
}
