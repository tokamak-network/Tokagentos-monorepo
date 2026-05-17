# x402 Chat Fallback — Integration Recipe

> Status: infrastructure landed, ChatView wiring deferred.
> Owners: app-core UI maintainer + billing-plugin maintainer.

This document is the handoff for "ChatView falls back to PTON payments when
no API key is configured." The load-bearing pieces — the x402 dance and the
React hook — are landed and unit-tested. What remains is the UI wiring,
which couldn't be runtime-verified because tokagentos boot is currently
blocked on an unrelated adapter-version mismatch.

## What's already done

| Piece | Path | Notes |
|---|---|---|
| Pure x402-dance helper | `src/lib/x402-send.ts` | Probe → sign → retry. Throws typed `X402Error`. |
| React hook | `src/lib/useX402ChatSend.ts` | Wraps helper + on-demand wallet connect. State machine: idle → probing → awaiting_signature → settling → done\|error. |
| Unit tests | `src/lib/__tests__/x402-send.test.ts` | 7 tests covering happy path + all error surfaces. |

## What still needs wiring

### 1. A place to store the optional API key (one decision needed)

Currently the user can mint `sk-ai-*` keys in `KeysView.tsx` but the
plaintext is shown once and forgotten. To let ChatView check "does the user
have a configured key", pick ONE of:

- **(a) Browser localStorage**: simplest. Add a "Default billing key"
  field in a settings panel; persist as `localStorage.tokagent.billingApiKey`.
  Cleared on logout / when the user revokes the key server-side.
- **(b) Agent secrets manager**: more robust; the key is encrypted at rest
  by tokagent's secret manager and survives across sessions. Adds one
  setting key + a getter helper.
- **(c) Hybrid**: localStorage as cache, secrets manager as source of truth.

Recommendation: **(a) for the first iteration**, migrate to (b) when the
secrets manager has a UI surface.

### 2. The branch point in `useChatSend.ts`

The chat send path is:

```
ChatView → AppContext.handleChatSend → useChatSend.handleChatSend
  → sendChatText (uses client.sendConversationMessageStream)
```

The smallest-blast-radius branch sits inside `handleChatSend` at
`src/state/useChatSend.ts:763` BEFORE the call to `sendChatText`:

```ts
const billingApiKey =
  typeof window !== "undefined"
    ? window.localStorage.getItem("tokagent.billingApiKey")
    : null;

if (!billingApiKey && claimedInput.trim()) {
  // x402 fallback path
  await sendX402PaymentMessage(claimedInput, /* opts */);
  return;
}

// existing path — uses tokagentos conversation API
await sendChatText(claimedInput, { ... });
```

`sendX402PaymentMessage` is a new function (or a thin component-level
handler) that:

1. Calls `useX402ChatSend.send({ model, max_tokens, messages: [...] })`.
2. While `status.kind === "awaiting_signature"`, opens the signing modal
   (see §3) with the preview from `status.preview`.
3. On `done`, appends the assistant reply to the chat surface manually —
   the tokagent conversation doesn't see x402 messages, so the UI must
   render them itself.

### 3. The signing modal (UI)

The hook surfaces the right states but doesn't render. Minimum modal:

```
┌───────────────────────────────────────────────┐
│  Sign to send                                 │
├───────────────────────────────────────────────┤
│  Model:   glm-4.7                             │
│  Max:     {fmtPton(amountAttoPton)} PTON      │
│  Refund:  unused PTON returned automatically  │
│                                               │
│  [Cancel]                  [Sign in wallet]   │
└───────────────────────────────────────────────┘
```

- Opens when `status.kind === "awaiting_signature"`.
- "Sign in wallet" doesn't dispatch anything — the wallet pops up
  automatically when `useX402ChatSend.send()` is called, because the hook
  triggers `signTypedData` inside its `await`. The modal is purely
  informational while the user reads/approves in their wallet.
- "Cancel" calls `reset()` and surfaces a toast.

### 4. Display the x402 reply in chat

The tokagentos conversation API doesn't know about x402 messages. Two
options:

- **(a) Inline-only**: render x402 replies as transient messages that vanish
  on page reload. Tag them visually ("Paid with PTON — not saved").
- **(b) Local mirror**: write x402 message pairs to a local-only chat log
  that displays alongside conversation history but isn't synced.

For first iteration: (a). The proxy already keeps a 90-day audit log
(`billing_call_log`) so the user can review past x402 calls in the Usage
panel.

### 5. Conversation persistence loss (already accepted)

x402 messages bypass tokagent's conversation runtime. They:
- Are NOT seen by the agent's RAG / memory layer.
- Are NOT included in the agent's reply context on subsequent messages.
- Are NOT saved to the agent's database.

For most "ask the model a one-shot question" UX this is fine. For
multi-turn chat with state, users should mint an API key.

## Testing notes

### Unit-testable today

The helper + hook can be unit-tested in isolation:

```bash
cd packages/app-core && bun run test x402-send
```

The hook's `signTypedData` callback can be mocked in component tests:

```ts
import { renderHook, act } from "@testing-library/react";
import { useX402ChatSend } from "./useX402ChatSend";

// Mock window.ethereum + ethers in setup.
```

### Runtime smoke test (after tokagentos boots)

1. Set `tokagent.billingApiKey` to null in localStorage.
2. Send a message in the chat.
3. Wallet should pop up requesting EIP-3009 signature.
4. Approve.
5. Reply appears in chat tagged "Paid with PTON".
6. Verify in the Usage panel: a new call_log row.
7. Verify the assistant reply doesn't appear in conversation history.

### Failure modes to cover in QA

| Trigger | Expected status | UI handling |
|---|---|---|
| User rejects wallet popup | `error` with code `user_rejected` | Toast: "Signing cancelled" |
| Proxy returns 200 immediately (already credited) | `error` with code `no_402_returned` | Toast: "You already have credit — using existing balance" + retry through normal path |
| Wallet on wrong chain | `error` after sign | Toast: "Switch to {CHAIN_NAME}" |
| Insufficient PTON in wallet | proxy returns 402 on retry → `error` code `settle_rejected` | Toast: "Insufficient PTON. Top up here." with link to TopupView |
| LiteLLM upstream 502 | `error` with code `upstream_failed` | Toast: "Model temporarily unavailable. Refund queued automatically." |

## When to revisit this doc

- When tokagentos boots cleanly and runtime smoke can run.
- When billing-key storage decision is made (item 1 above).
- When `useChatSend.ts` undergoes other significant refactoring — coordinate
  the x402 branch.

## Related files

- `src/components/pages/billing/eip712-utils.ts` — typed-data helpers (reused
  by the helper here)
- `src/components/pages/billing/TopupView.tsx` — reference for the
  wallet-signing flow against the same proxy
- `plugins/plugin-tokagent-billing/src/routes/setup-routes.ts` — operator
  setup wizard, separate concern but adjacent
