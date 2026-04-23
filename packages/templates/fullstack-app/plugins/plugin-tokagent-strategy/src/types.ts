import type { Address, Hex } from "viem";

export type StrategyKind =
  | "perp-funding-arb"
  | "yield-auto-compound"
  | "polymarket-value-hunt";

export type StrategyStatus =
  | "draft"     // built but not yet started
  | "testing"   // running in dry-run mode (evaluates but doesn't execute)
  | "active"    // running, executing state changes
  | "paused"    // temporarily suspended
  | "stopped";  // permanently stopped, retained for history

export interface StrategyTickEntry {
  at: number;        // unix ms
  action: string;    // short label, e.g., "evaluated", "executed", "skipped"
  result: string;    // one-line summary
}

export interface Strategy {
  id: string;                        // uuid
  name: string;                      // LLM-generated
  description: string;               // LLM-generated rationale
  kind: StrategyKind;
  params: Record<string, unknown>;   // kind-specific, validated per kind
  vault: { chainId: number; address: Address };
  schedule: { everyMs: number };
  status: StrategyStatus;
  createdAt: number;
  lastTickAt?: number;
  lastError?: string;
  tickHistory: StrategyTickEntry[];  // capped at 50 most recent entries
}

/**
 * Contract a StrategyKind implementation must satisfy. One per kind.
 *
 * evaluate: read external state and decide whether to act. Pure/read-only.
 * execute: perform any state changes. Only called if evaluate().shouldExecute = true
 *   AND the strategy status is "active" (NOT "testing"). When status == "testing",
 *   execute() is skipped — the tick is recorded as "would have executed".
 */
export interface StrategyKindImpl<P = unknown> {
  kind: StrategyKind;
  paramSchema: import("zod").ZodType<P>;
  evaluate(
    params: P,
    vault: { chainId: number; address: Address },
    runtime: import("@tokagentos/core").IAgentRuntime,
  ): Promise<{
    shouldExecute: boolean;
    summary: string;       // e.g., "BTC funding 0.012%/hr, ETH 0.004%/hr — spread 80bps above threshold"
    context?: Record<string, unknown>; // data piped to execute()
  }>;
  execute(
    params: P,
    vault: { chainId: number; address: Address },
    context: Record<string, unknown> | undefined,
    runtime: import("@tokagentos/core").IAgentRuntime,
  ): Promise<{
    summary: string;       // e.g., "Opened BTC long 0.5x, ETH short 0.5x. txs: 0x..., 0x..."
    txHashes?: Hex[];
  }>;
}
