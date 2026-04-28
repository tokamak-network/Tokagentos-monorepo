/**
 * Helpers for returning structured ActionResult values from Tokagent plugin
 * actions without leaking validator errors into the chat.
 *
 * Background: eliza's chat runtime treats `result.text` from an action
 * callback as the assistant's reply. When a plugin action validates input
 * and returns `{ success: false, text: "Invalid X..." }`, that error string
 * shows up verbatim in chat — completely overriding the LLM's natural
 * response. From the user's POV the agent looks broken.
 *
 * Fix: when an action can't proceed because of bad/missing input,
 * return the structured error WITHOUT a `text` field. The runtime's
 * normalizer skips empty callback text, the LLM's reply stays intact,
 * and the LLM still has access to `data` for retry decisions.
 *
 * Use `tokagentActionError("invalid_vault_address", { provided, expected })`
 * instead of `{ success: false, text: "Invalid vaultAddress..." }`.
 *
 * Internal failures (LLM call errored, network down, etc.) can still
 * surface a chat-facing apology via `tokagentActionFailure(reason, message)`,
 * but the `message` should be a polite one-liner — not a stack trace.
 */

import type { ActionResult } from "@elizaos/core";

/**
 * User-visible-message-suppressing error. The LLM's natural-language
 * response wins; the error is recorded in `data` for tooling/debugging.
 */
export function tokagentActionError(
  reason: string,
  detail: Record<string, unknown> = {},
): ActionResult {
  return {
    success: false,
    // No `text`: eliza's normalizeActionCallbackText skips empty strings,
    // so the LLM's natural-language response remains the assistant message.
    data: { reason, ...detail },
  } as ActionResult;
}

/**
 * Use ONLY when the user genuinely needs to see a one-liner about an
 * unrecoverable failure (e.g., RPC down, vault on a chain we don't
 * support yet). Keep the message terse and human; never paste a stack
 * trace. Most "missing input" cases should use `tokagentActionError`
 * (no `text`) so the LLM can ask the clarifying question itself.
 */
export function tokagentActionFailure(
  reason: string,
  userFacingMessage: string,
  detail: Record<string, unknown> = {},
): ActionResult {
  return {
    success: false,
    text: userFacingMessage,
    data: { reason, ...detail },
  } as ActionResult;
}
