/**
 * Runtime `useModel` interceptor — bills internal LLM calls (chat tab,
 * action handlers, autonomy loops) against the operator's wallet.
 *
 * Why wrap useModel: the scaffold's chat tab and most plugin actions
 * funnel through `runtime.useModel(modelType, params)` directly — they
 * don't traverse the HTTP middleware where the existing /v1/messages
 * billing gate intercepts external API-key requests. Wrapping useModel
 * is the universal funnel that captures every LLM call regardless of
 * which surface initiated it.
 *
 * The billed wallet is derived from `process.env.EVM_PRIVATE_KEY`, which
 * the billing init step seeds from BILLING_OPERATOR_PRIVATE_KEY when the
 * host hasn't explicitly set it. Single-tenant scaffolded apps thus bill
 * everything against the operator who configured the billing rail.
 *
 * Non-text-generation model types (TOKENIZER, EMBEDDING, IMAGE, OBJECT)
 * pass through unwrapped — only TEXT_{NANO,SMALL,MEDIUM,LARGE} are billed.
 *
 * Heuristic token counting (v1):
 *   - Input tokens   ≈ rough estimate from prompt/messages
 *   - Output tokens  ≈ response chars / 4
 * Token counting is approximate (chars/4 heuristic). A future iteration
 * can swap in provider-reported usage from response metadata when the
 * provider returns it.
 */

import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { logger, type IAgentRuntime } from "@elizaos/core";
import {
  callLog,
  computeCharge,
  estimateInputTokens,
  estimateMaxCostUsd,
  reserve,
  release,
  commit as commitReservation,
  usdToPton,
  type BillingDatabase,
} from "@tokagentos/billing";
import { randomUUID } from "node:crypto";

const log = logger.child({ src: "billing:model-wrap" });

// ---------------------------------------------------------------------------
// Billable model-type filter
// ---------------------------------------------------------------------------

const BILLABLE_MODEL_TYPES = new Set<string>([
  "TEXT_NANO",
  "TEXT_SMALL",
  "TEXT_MEDIUM",
  "TEXT_LARGE",
  "TEXT_REASONING_SMALL",
  "TEXT_REASONING_LARGE",
]);

function isBillable(modelType: unknown): boolean {
  return typeof modelType === "string" && BILLABLE_MODEL_TYPES.has(modelType);
}

// ---------------------------------------------------------------------------
// Heuristic content extractors
// ---------------------------------------------------------------------------

/** Approximate token count for an arbitrary string. ~4 chars/token. */
function approxTokens(s: string): number {
  if (!s) return 0;
  return Math.ceil(s.length / 4);
}

/** Best-effort extraction of input text from useModel params. */
function extractPromptText(params: unknown): string {
  if (typeof params === "string") return params;
  if (!params || typeof params !== "object") return "";
  const p = params as Record<string, unknown>;
  if (typeof p.prompt === "string") return p.prompt;
  if (typeof p.text === "string") return p.text;
  if (Array.isArray(p.messages)) {
    return p.messages
      .map((m: unknown) => {
        if (!m || typeof m !== "object") return "";
        const msg = m as Record<string, unknown>;
        if (typeof msg.content === "string") return msg.content;
        if (Array.isArray(msg.content)) {
          return msg.content
            .map((c: unknown) =>
              c && typeof c === "object" && "text" in (c as Record<string, unknown>)
                ? String((c as Record<string, unknown>).text ?? "")
                : "",
            )
            .join("\n");
        }
        return "";
      })
      .join("\n");
  }
  return "";
}

/** Best-effort extraction of response text from useModel result. */
function extractResponseText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const r = result as Record<string, unknown>;
  if (typeof r.text === "string") return r.text;
  if (typeof r.output === "string") return r.output;
  if (typeof r.content === "string") return r.content;
  if (Array.isArray(r.content)) {
    return r.content
      .map((c: unknown) =>
        c && typeof c === "object" && "text" in (c as Record<string, unknown>)
          ? String((c as Record<string, unknown>).text ?? "")
          : "",
      )
      .join("\n");
  }
  // Some providers return { choices: [{ message: { content } }] }
  if (Array.isArray(r.choices)) {
    return r.choices
      .map((c: unknown) => {
        if (!c || typeof c !== "object") return "";
        const choice = c as Record<string, unknown>;
        const msg = choice.message as Record<string, unknown> | undefined;
        return typeof msg?.content === "string" ? msg.content : "";
      })
      .join("\n");
  }
  return "";
}

// ---------------------------------------------------------------------------
// Operator wallet resolution
// ---------------------------------------------------------------------------

let cachedOperatorAddress: Address | null = null;

function resolveOperatorAddress(): Address | null {
  if (cachedOperatorAddress) return cachedOperatorAddress;
  const pk = process.env.EVM_PRIVATE_KEY;
  if (!pk) return null;
  try {
    const acc = privateKeyToAccount(pk.startsWith("0x") ? (pk as `0x${string}`) : `0x${pk}`);
    cachedOperatorAddress = acc.address;
    return acc.address;
  } catch (err) {
    log.warn(
      { err: (err as Error).message },
      "could not derive operator wallet from EVM_PRIVATE_KEY — model calls will not bill",
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WrapModelDeps {
  db: BillingDatabase;
  marginBps: number;
  tonUsdGetter: () => number | null;
}

/**
 * Replace `runtime.useModel` with a billing-aware wrapper. Idempotent —
 * calling twice is a no-op (a flag on the runtime prevents double-wrapping).
 *
 * The wrapper bills only TEXT_{NANO,SMALL,MEDIUM,LARGE,REASONING_*} calls
 * and only when:
 *   - billing is enabled (caller's responsibility before calling)
 *   - operator wallet can be derived from EVM_PRIVATE_KEY
 *   - TON/USD price is known (cache hit or admin override)
 *
 * Any path that fails one of those gates passes through to the original
 * useModel — never blocks the chat. A no-bill call is logged at debug.
 */
export function wrapRuntimeUseModel(
  runtime: IAgentRuntime,
  deps: WrapModelDeps,
): void {
  const r = runtime as unknown as {
    useModel?: (...args: unknown[]) => Promise<unknown>;
    __billingWrappedUseModel?: boolean;
  };
  if (r.__billingWrappedUseModel) return;
  const original = r.useModel;
  if (typeof original !== "function") {
    log.warn("runtime.useModel not a function — skipping billing wrap");
    return;
  }
  r.__billingWrappedUseModel = true;

  const wrapped = async function (
    this: unknown,
    ...args: unknown[]
  ): Promise<unknown> {
    const [modelType, params] = args as [unknown, unknown];
    if (!isBillable(modelType)) {
      return await original.apply(this, args);
    }

    const wallet = resolveOperatorAddress();
    const tonUsd = deps.tonUsdGetter();
    if (!wallet || tonUsd == null || tonUsd <= 0) {
      log.debug(
        { wallet: !!wallet, tonUsd },
        "no wallet or no price — passing model call through unbilled",
      );
      return await original.apply(this, args);
    }

    const requestId = randomUUID();
    const modelId = String(modelType);
    const promptText = extractPromptText(params);
    const promptTokens = approxTokens(promptText);
    // Default reservation envelope: assume 4096 output tokens at the
    // largest plausible per-token rate, capped at a sane USD ceiling.
    const messages = promptText
      ? [{ role: "user", content: promptText }]
      : [];
    const maxCostUsd = estimateMaxCostUsd({
      model: "claude-haiku-4-5",
      inputTokens: Math.max(promptTokens, estimateInputTokens(messages)),
      maxOutputTokens: 4096,
      hasCacheControl: false,
    });
    const maxCostPton = usdToPton(Math.min(maxCostUsd * 1.2, 1.0), tonUsd);

    const reservation = await reserve(deps.db, {
      wallet,
      amount: maxCostPton,
      requestId,
    }).catch((err: unknown) => {
      log.warn(
        { err: (err as Error).message, wallet, modelId },
        "reserve failed — passing call through unbilled",
      );
      return null;
    });

    if (!reservation || !reservation.ok) {
      // Insufficient credits — let the call proceed but log it so the
      // operator sees the issue in their logs. Production deployments
      // should probably 402 here; for the scaffold we keep chat flowing.
      log.warn(
        { wallet, modelId, reservation },
        "insufficient credits or reserve refused — call proceeds without billing",
      );
      return await original.apply(this, args);
    }

    let result: unknown;
    let errored = false;
    try {
      result = await original.apply(this, args);
    } catch (err) {
      errored = true;
      // Release the reservation so the funds aren't stuck.
      await release(deps.db, reservation.reservationId).catch(() => undefined);
      throw err;
    }

    // Commit actual cost.
    const responseText = extractResponseText(result);
    const outputTokens = approxTokens(responseText);
    const inputTokens = Math.max(promptTokens, estimateInputTokens(messages));

    const actualUsd =
      ((inputTokens + outputTokens) / 1_000_000) * /* haiku-ish blended */ 1.5;
    const charge = computeCharge({
      actualUsd,
      tonUsd,
      marginBps: deps.marginBps,
    });

    try {
      await commitReservation(deps.db, reservation.reservationId, charge.totalPton);
      await deps.db.insert(callLog).values({
        wallet,
        apiKeyId: null,
        model: modelId,
        inputTokens,
        outputTokens,
        cacheInputTokens: 0,
        cacheCreationTokens: 0,
        costUsd: actualUsd.toFixed(8),
        costPton: charge.totalPton,
        requestId,
        status: errored ? "error" : "ok",
      });
      log.debug(
        {
          wallet,
          modelId,
          inputTokens,
          outputTokens,
          costPton: charge.totalPton.toString(),
        },
        "model call billed",
      );
    } catch (err) {
      log.warn(
        { err: (err as Error).message, requestId, modelId },
        "commit/log failed — reservation may need manual cleanup",
      );
    }

    return result;
  };

  r.useModel = wrapped as typeof original;
  log.info("runtime.useModel wrapped — chat-tab LLM calls now bill operator wallet");
}
