import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FullstackTemplateValues,
  PluginTemplateValues,
  ProjectTemplateMetadata,
  TemplateDefinition,
  TemplateUpstream,
} from "./types.js";

const SKIP_NAMES = new Set([
  ".DS_Store",
  ".git",
  ".turbo",
  ".vite",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".gz",
  ".wasm",
  ".dylib",
  ".dll",
  ".so",
]);
/**
 * Paths inside the freshly-hydrated upstream submodule (eliza) that we always
 * remove before bun install. These pull in workspace dependencies (chiefly
 * `@elizaos/cloud-sdk`) that Tokagent does not ship and that would otherwise
 * cause `bun install` to fail with "Workspace dependency ... not found".
 *
 * - `plugins/plugin-elizacloud` declares `@elizaos/cloud-sdk: workspace:*`
 *   and is matched by the scaffolded project's `tokagent/plugins/plugin-*\/typescript`
 *   workspace glob. Removing the directory takes it out of the workspace set.
 * - `cloud` is the eliza Cloud monorepo provided as a git submodule; we don't
 *   use it. Removing it keeps `tokagent/package.json` workspace entries
 *   `cloud/packages/sdk` and `cloud/packages/services/billing` from resolving
 *   if a developer ever runs `bun install` inside `tokagent/` directly.
 */
export const UPSTREAM_PRUNE_PATHS = [
  "plugins/plugin-elizacloud",
  "cloud",
  // Dead `elizaos-plugins/*` submodules. The github.com/elizaos-plugins
  // org was depopulated as of 2026-05-05 — every plugin repo returns 404.
  // Stripping these entries from upstream eliza's .gitmodules BEFORE
  // recursive submodule init prevents the scaffold from 404-storming.
  // Plugin code is now resolved via npm (see root package.json pins).
  // Refresh procedure: when bumping the upstream eliza commit, grep
  // upstream's .gitmodules for `elizaos-plugins/` and add any newly-
  // appearing paths to this list.
  "plugins/plugin-agent-skills",
  "plugins/plugin-anthropic",
  "plugins/plugin-discord",
  "plugins/plugin-evm",
  "plugins/plugin-google-genai",
  "plugins/plugin-groq",
  "plugins/plugin-imessage",
  "plugins/plugin-local-ai",
  "plugins/plugin-local-embedding",
  "plugins/plugin-ollama",
  "plugins/plugin-openai",
  "plugins/plugin-openrouter",
  "plugins/plugin-pdf",
  "plugins/plugin-shopify",
  "plugins/plugin-sql",
  "plugins/plugin-telegram",
  "plugins/plugin-twitter",
  "plugins/plugin-wechat",
  "plugins/plugin-whatsapp",
  // Additional dead `elizaos-plugins/*` submodules discovered via smoke
  // test on 2026-05-05. These exist only in upstream eliza's
  // .gitmodules (not the user's repo) so they were missed in the
  // initial Task 3 prune list. All 10 return 404 on github.com/elizaos-plugins.
  "plugins/plugin-agent-orchestrator",
  "plugins/plugin-cli",
  "plugins/plugin-commands",
  "plugins/plugin-cron",
  "plugins/plugin-edge-tts",
  "plugins/plugin-music-library",
  "plugins/plugin-music-player",
  "plugins/plugin-plugin-manager",
  "plugins/plugin-shell",
  "plugins/plugin-solana",
  // Upstream eliza's example/demo workspaces. They reference `@elizaos/
  // plugin-anthropic` (and others) via stale specifiers — `"alpha"` tag
  // and `file:../../plugins/plugin-anthropic` paths — which conflict
  // with the npm pins in tokagent/package.json once the file: paths
  // can't resolve (the workspace dirs were pruned above). Bun's
  // workspace reconciler then silently drops `@elizaos/plugin-anthropic`
  // (and siblings) from the install entirely. Solution: prune the
  // examples directory so it's not part of the scaffolded workspace.
  // The examples are upstream demos, not part of the tokagentos product.
  "packages/examples",
] as const;

/**
 * Workspace entries inside the upstream `tokagent/package.json` that point at
 * paths we prune via UPSTREAM_PRUNE_PATHS. We strip them so the upstream
 * package.json stays internally consistent for any tooling that reads it.
 */
const UPSTREAM_WORKSPACE_REMOVALS = [
  "cloud/packages/sdk",
  "cloud/packages/services/billing",
] as const;

/**
 * Other upstream package.json files that still reference the pruned packages.
 * Removing these dep entries keeps `bun install` from re-introducing the
 * "Workspace dependency ... not found" error on the scaffolded project root.
 *
 * Each `path` is relative to the upstream submodule root. Each entry in
 * `names` is removed from `dependencies`, `devDependencies`, and
 * `peerDependencies` if present.
 */
const UPSTREAM_DEPENDENCY_REMOVALS: ReadonlyArray<{
  readonly path: string;
  readonly names: readonly string[];
}> = [
  {
    path: "packages/typescript/package.json",
    names: ["@elizaos/plugin-elizacloud"],
  },
  {
    path: "packages/app-core/deploy/cloud-agent-template/package.json",
    names: ["@elizaos/plugin-elizacloud"],
  },
  // app-lifeops messaging deps are now pinned to npm via the workspace:*
  // rewrite in UPSTREAM_PLUGIN_NPM_PINS (plugin-imessage, plugin-signal,
  // plugin-telegram, plugin-whatsapp). The previous strip-from-deps
  // approach left app-lifeops's source code (e.g. telegram-local-client.ts
  // importing @elizaos/plugin-telegram/account-auth-service) unable to
  // resolve at compile time. Removed in scaffold-recovery follow-up
  // 2026-05-05.
];

/**
 * npm version pins for `@elizaos/plugin-*` packages whose source repos
 * were depopulated from `elizaos-plugins/*` (404 on GitHub). When upstream
 * eliza's package.json files declare `"workspace:*"` for these, the
 * workspace can't resolve because the plugin source isn't on disk.
 * Rewrite each `"workspace:*"` to the matching npm version so `bun install`
 * resolves from the registry instead.
 *
 * Versions verified during scaffold-recovery follow-up on 2026-05-05.
 * Refresh procedure: when bumping the upstream eliza commit, run
 * `bun install` against a fresh scaffold and add npm pins for any
 * newly-failing `@elizaos/plugin-*` workspace deps.
 */
export const UPSTREAM_PLUGIN_NPM_PINS: Readonly<Record<string, string>> = {
  // Alpha-track pins matching the upstream eliza commit (db00cf61) that
  // uses @elizaos/core@2.0.0-alpha.537. Stable 1.x pins were initially
  // chosen but caused subpath-export mismatches (e.g., plugin-sql@1.7.2
  // doesn't export "/schema" while 2.0.0-alpha.20 does).
  "@elizaos/plugin-agent-orchestrator": "2.0.0-alpha.537",
  "@elizaos/plugin-anthropic": "2.0.0-alpha.537",
  "@elizaos/plugin-browser-bridge": "0.1.1",
  "@elizaos/plugin-groq": "2.0.0-alpha.10",
  "@elizaos/plugin-imessage": "2.0.0-alpha.6",
  "@elizaos/plugin-local-ai": "2.0.0-alpha.5",
  "@elizaos/plugin-local-embedding": "2.0.0-alpha.537",
  "@elizaos/plugin-ollama": "2.0.0-alpha.537",
  "@elizaos/plugin-openai": "2.0.0-alpha.537",
  "@elizaos/plugin-pdf": "2.0.0-alpha.537",
  "@elizaos/plugin-signal": "2.0.0-alpha.537",
  "@elizaos/plugin-solana": "2.0.0-alpha.5",
  "@elizaos/plugin-sql": "2.0.0-alpha.20",
  "@elizaos/plugin-telegram": "2.0.0-alpha.537",
  "@elizaos/plugin-wechat": "2.0.0-alpha.537",
  "@elizaos/plugin-whatsapp": "2.0.0-alpha.537",
};

/**
 * Narrow surgical edits applied to upstream eliza files after hydration.
 *
 * Use these instead of full-file scaffold-patch overlays when the change is
 * a single semantic edit and the surrounding code can be tracked verbatim
 * with upstream. Each `find` string is replaced with `replaceWith` exactly
 * once; if the find string isn't present in the upstream file, the error is
 * loud (an exception) so we know to revisit when upstream changes.
 *
 * Trade-off vs. a full-file overlay:
 *   + Almost zero divergence from upstream — easy to keep current
 *   + Forces a code review on upstream-side changes via the loud-error
 *   - Brittle if upstream reformats whitespace inside the matched span
 *
 * Use full overlays for major rewrites; use surgical patches for one-line
 * UX fixes like removing a hardcoded canned response.
 */
export const UPSTREAM_SURGICAL_PATCHES: ReadonlyArray<{
  readonly path: string;
  readonly description: string;
  readonly find: string;
  readonly replaceWith: string;
}> = [
  {
    path: "packages/agent/src/api/server-helpers.ts",
    description:
      "Remove the IDENTITY-intent canned wallet-status dump. Upstream's " +
      "`/\\b(wallet\\s*address|address)\\b/i` regex matches almost any " +
      "DeFi-operator chat message ('vault address', 'contract address', " +
      "'where do I deploy', etc.) and short-circuits the LLM with a static " +
      "wallet-status block. Tokagent's persona is built around exactly " +
      "those topics so the override is hostile UX. Connectors-only and " +
      "no-wallet-execution gates above remain in place.",
    find: `  if (WALLET_IDENTITY_INTENT_RE.test(prompt)) {
    return [
      \`Wallet network: \${walletNetwork}.\`,
      walletSummary,
      \`plugin-evm: \${pluginEvmLoaded ? "loaded" : "not loaded"}.\`,
      \`Execution readiness: \${executionReady ? "ready for wallet actions" : (executionBlockedReason ?? "blocked")}.\`,
      \`Automation mode: \${automationMode}.\`,
    ].join("\\n");
  }
`,
    replaceWith:
      "  // [tokagent surgical-patch] removed IDENTITY-intent wallet-status\n" +
      "  // dump — see scaffold.ts UPSTREAM_SURGICAL_PATCHES.\n",
  },
  {
    path: "packages/ui/src/components/composites/chat/chat-message.tsx",
    description:
      "Suppress the redundant 'Reply to an earlier message' chip on " +
      "assistant bubbles. Eliza's message-handler service auto-stamps " +
      "inReplyTo on every assistant turn (services/message.ts), so the " +
      "chat-message UI renders a quote chip on every assistant bubble " +
      "pointing at the user message immediately above it. The chip adds " +
      "value only on user-initiated quote-replies; on assistant turns " +
      "it's pure noise. Gate the chip on isUser so it only renders for " +
      "user-side messages. (Cross-turn agent references will need a " +
      "follow-up patch if they ever become a real product feature; for " +
      "now they're never user-visible because the runtime auto-points " +
      "every reply at the immediately-preceding user message.)",
    find:
      "  const showReplyReference = Boolean(\n" +
      "    !isEditing && replyTargetId && normalizedSource,\n" +
      "  );\n",
    replaceWith:
      "  // [tokagent surgical-patch] only render the reply-chip for\n" +
      "  // user-initiated quote-replies. See scaffold.ts UPSTREAM_SURGICAL_PATCHES.\n" +
      "  const showReplyReference = Boolean(\n" +
      "    !isEditing && replyTargetId && normalizedSource && isUser,\n" +
      "  );\n",
  },
  {
    path: "packages/agent/src/config/plugin-auto-enable.ts",
    description:
      "Disable the n8n-workflow auto-enable. Upstream auto-enables it " +
      "whenever the local n8n sidecar is permitted (default true), but " +
      "Tokagent doesn't ship @elizaos/plugin-n8n-workflow so the loader " +
      "warns 'Could not load plugin @elizaos/plugin-n8n-workflow' on every " +
      "boot. Force-disable to silence the warning. Re-enable in upstream " +
      "deployments by removing this surgical-patch.",
    find:
      "    // Default is \"local sidecar allowed\" — only disable if explicitly set to\n" +
      "    // false. Mobile forces this to false regardless of user setting.\n" +
      "    const localN8nEnabled =\n" +
      "      params.isNativePlatform === true\n" +
      "        ? false\n" +
      "        : n8nConfig?.localEnabled !== false;\n",
    replaceWith:
      "    // [tokagent surgical-patch] @elizaos/plugin-n8n-workflow isn't\n" +
      "    // shipped in the Tokagent scaffold, so force-skip the auto-enable\n" +
      "    // path here. See scaffold.ts UPSTREAM_SURGICAL_PATCHES.\n" +
      "    const localN8nEnabled = false;\n",
  },
  {
    path: "packages/agent/src/runtime/eliza.ts",
    description:
      "Add a Tokagent capability hint to the system-prompt suffix. Upstream " +
      "appends an n8n hint when the local n8n sidecar is enabled, but " +
      "doesn't mention the Tokagent plugins (perps, polymarket, yield, " +
      "strategy). Without an explicit hint, the LLM falls back to training " +
      "data and hallucinates capabilities. Seed `capabilityHints` with a " +
      "single Tokagent line so the system prompt always advertises the " +
      "Tokagent action surface.",
    find: "  const capabilityHints: string[] = [];\n",
    replaceWith:
      "  const capabilityHints: string[] = [\n" +
      "    [\n" +
      '      "You operate a Tokagent vault on Tokamak. Operating manual:",\n' +
      '      "",\n' +
      '      "1. Discover state first. If the user asks about capabilities, current strategies, or vault status, do not guess — call GET_TOKAGENT_STATUS or read the [vault-context] block at the top of the prompt before replying.",\n' +
      '      "",\n' +
      '      "2. Two-turn rule for any write action (DEPLOY, BUILD, START, STOP, OPEN/CLOSE_PERP, DEPOSIT, WITHDRAW). Turn 1 = PROPOSE in future tense, end with a question, do NOT emit the action (actions: []). Turn 2 = EXECUTE only after the user replies yes / go / confirm. Never use \\"i\\u2019m deploying\\" or \\"deploying now\\" on the propose turn — that is a lie until the receipt confirms on-chain.",\n' +
      '      "",\n' +
      '      "3. Mode selection (FIRST turn of any strategy / trade / position request). Two execution modes exist; ASK before proposing any DEPLOY or BUILD: (a) VAULT mode — capital is custodied in an on-chain Tokagent vault; every strategy write goes through the vault\\u2019s allowlisted batch executor. Reversible-by-design, auditable, the default for production. (b) LOCAL-BOT mode — the agent signs trades directly from the operator\\u2019s hot wallet against the target protocol (Hyperliquid REST, Aave, Polymarket); no on-chain vault deploy, faster to start, but every action is a freelance signature from the hot wallet. Phrase the question concretely (\\"do you want a vault — capital custodied in a smart contract — or a local bot — direct from your hot wallet?\\") and wait for a clear answer before proceeding. Once chosen, the mode persists in TOKAGENT_EXECUTION_MODE and you do not re-ask in subsequent turns.",\n' +
      '      "",\n' +
      '      "4. No-vault path (VAULT mode only). If the user asks for any strategy / trade / position and no vault is deployed yet, propose DEPLOY_TOKAGENT_VAULT first (defaults: chain=hyperevm, packs match the requested kind). After the user confirms, submit. After receipt, the [vault-context] block lists the new vault — only then proceed to BUILD_STRATEGY.",\n' +
      '      "",\n' +
      '      "5. With-vault path. BUILD_STRATEGY (compose), then START_STRATEGY. STOP_STRATEGY to pause. BACKTEST_STRATEGY to dry-run.",\n' +
      '      "",\n' +
      '      "6. Strategy kinds (Tokagent-specific — never describe these from training-data assumptions):",\n' +
      '      "   • yield-auto-compound: supply USDC to Aave v3 on Polygon and re-stake yield. Single venue.",\n' +
      '      "   • polymarket-value-hunt: scan Polymarket binary markets for mispriced YES/NO outcomes and buy the cheap leg.",\n' +
      '      "   • perp-funding-arb: SINGLE-exchange (Hyperliquid only) cross-symbol funding-rate dispersion. Long the lowest-funding symbol + short the highest-funding symbol in the SAME vault. NOT cross-exchange. There is no second venue.",\n' +
      '      "",\n' +
      '      "7. Source-of-truth rule. The [vault-context] block at the top of every turn is ground truth. Never assert \\"vault is deployed\\" unless that block lists an address for the relevant chain. If you submitted DEPLOY_TOKAGENT_VAULT and the next turn\\u2019s context still shows \\"none deployed\\", the deploy failed — say so.",\n' +
      '      "",\n' +
      '      "8. Describe-X rule. When the user asks \\"what is X?\\" or \\"what does X do?\\", describe X first — do NOT ask another clarifying question. Use the strategy-kinds bullets above for kinds.",\n' +
      '      "",\n' +
      '      "9. Hard rules: never invent vault addresses, contract addresses, balances, or APRs. If you do not know a value, ask or read it from a tool. Never call action handlers with placeholder values like 0x123. If an action returns reason=invalid_vault_address with a hint about DEPLOY_TOKAGENT_VAULT, do that — do NOT retry with a different placeholder.",\n' +
      '      "",\n' +
      '      "10. Recovery rule. When an action returns a user-facing failure that includes a concrete on-chain artifact (a deployed address the receipt-parser missed, a successful tx hash, etc.), or when the user pastes a 0x address after a deploy \\"failed\\", immediately PROPOSE the matching recovery action by NAME. For a deployed vault address after DEPLOY_TOKAGENT_VAULT failure, that action is REGISTER_EXISTING_VAULT(vaultAddress, chain) — propose it on turn 1 (actions: []), execute on turn 2 after confirm. Never ask the user \\"do you have a way to register this directly?\\" — that is YOUR tool, USE it.",\n' +
      '      "",\n' +
      '      "11. No UI/cache narration. Do NOT describe the [vault-context] block, runtime settings, or app state as if they were facts about reality (\\"the system hasn\\u2019t picked it up\\", \\"settings still show none\\", \\"the vault-context shows...\\"). Those are caches the operator does not care about. Instead, state what you will do next (e.g., \\"i\\u2019ll register the deployed address now — confirm?\\").",\n' +
      "      // NOTE: Bullet 10 references action name REGISTER_EXISTING_VAULT exactly.\n" +
      "      // If the action's name/description/parameters change in\n" +
      "      // plugins/plugin-tokagent-strategy/src/actions/register-existing-vault.ts,\n" +
      "      // update bullet 10 here to match.\n" +
      "    ].join(\"\\n\"),\n" +
      "  ];\n",
  },
  {
    path: "packages/agent/src/runtime/default-knowledge.ts",
    description:
      "Replace upstream's seeded Eliza knowledge with Tokagent knowledge. " +
      "Upstream seeds 3 docs into the agent's memory at boot (eliza-overview, " +
      "eliza-history, eliza-cloud-basics) describing the elizaOS chatbot. " +
      "RAG retrieval against those docs makes the agent introduce itself as " +
      "'created by Joseph Weizenbaum at MIT in the mid-1960s' — completely " +
      "off-character for a Tokagent vault operator. Replace each text " +
      "constant in-place; the doc keys/filenames stay the same so seed-by-key " +
      "deduplication continues to work across boots.",
    find:
      'export const ELIZA_OVERVIEW_TEXT =\n' +
      '  "Eliza is an autonomous agent powered by elizaOS, the agent framework. Users can ask Eliza to write code, add new skills, and trigger recurring workflows with heartbeats that run at regular intervals. Eliza Cloud is an open source cloud backend that simplifies deploying and delivering Eliza.";\n' +
      '\n' +
      'export const ELIZA_HISTORY_TEXT =\n' +
      '  "ELIZA was created by Joseph Weizenbaum at MIT in the mid-1960s and is widely regarded as one of the earliest chatbots. Its best-known script, DOCTOR, used pattern matching to imitate a Rogerian psychotherapist and showed how simple language rules could feel surprisingly conversational. ELIZA helped define the history of chatbots and influenced later work on conversational agents.";\n' +
      '\n' +
      'export const ELIZA_CLOUD_BASICS_TEXT =\n' +
      '  "Eliza Cloud is the managed backend and app platform for Eliza when cloud mode is enabled. Builders can create an app, keep its appId, use Cloud login and redirect flows so app users can authenticate against Cloud, route chat and media APIs through Cloud, monetize app usage with inference markup and purchase-share settings, and deploy Docker containers when an app needs server-side execution.";\n',
    replaceWith:
      'export const ELIZA_OVERVIEW_TEXT =\n' +
      '  "Tokagent is a DeFi vault operator built on Tokamak. It runs automated strategies out of an on-chain vault that the operator controls, sizing positions against available collateral and routing every write through the vault\\u2019s allowlisted batch executor. Strategy kinds: yield-auto-compound = supply USDC to Aave v3 on Polygon and re-stake yield. polymarket-value-hunt = scan Polymarket binary markets for mispriced YES/NO outcomes and buy the cheap leg. perp-funding-arb = SINGLE-exchange (Hyperliquid only) cross-symbol funding-rate dispersion: long the symbol with the lowest hourly funding, short the symbol with the highest funding, both legs in the same Hyperliquid vault. It is NOT cross-exchange. Always call GET_TOKAGENT_STATUS at the start of a session, propose actions before executing, and never invent vault addresses, balances, or APRs.";\n' +
      '\n' +
      'export const ELIZA_HISTORY_TEXT =\n' +
      '  "Tokagent is built on top of elizaOS, an open-source agent framework. The Tokagent product layer adds four plugins: tokagent-strategy (GET_TOKAGENT_STATUS, BUILD_STRATEGY, DEPLOY_TOKAGENT_VAULT, list/start/stop, backtest), tokagent-perps (Hyperliquid perpetual trading via vault allowlist), tokagent-polymarket (Polymarket buy/sell/redeem via vault allowlist), and tokagent-yield (Aave deposit/withdraw via vault allowlist). A vaultContext provider injects current vault and strategy state into every turn so the LLM never has to guess about deployed state. The agent uses these plugins to compose, deploy, and run strategies from chat — with a two-turn pattern: propose first, execute only after user confirmation.";\n' +
      '\n' +
      'export const ELIZA_CLOUD_BASICS_TEXT =\n' +
      '  "A Tokagent vault is an on-chain smart contract on Tokamak that holds operator capital and routes writes through an allowlisted batch executor. The agent never signs freelance transactions from the hot wallet by default; instead it submits batches to the vault, which validates them against the allowlist before execution. To deploy a new vault: call DEPLOY_TOKAGENT_VAULT with chain (defaults to hyperevm) and packs (defaults to the chain\\u2019s primary pack — hyperliquid-perps-hyperevm on hyperevm, aave-v3-polygon on polygon). The deploy waits for transaction receipt and persists the new vault address back to runtime settings, so the [vault-context] block on the next turn lists the deployed address. Subsequent BUILD_STRATEGY / OPEN_PERP_POSITION / DEPOSIT_TO_AAVE / etc. operate against that vault.";\n',
  },
  {
    path: "packages/app-core/src/state/useChatSend.ts",
    description:
      "Extend QueuedChatSend with optimisticUserMsgId so sendChatText can " +
      "thread the locally-rendered user-bubble id through to the queued task. " +
      "Without this, the queue task generates a new id and re-inserts the " +
      "user message, producing a duplicate bubble alongside the optimistic " +
      "one. Pairs with the sendChatText optimistic-insert patch and the " +
      "runQueuedChatSend dedup patch.",
    find:
      "export interface QueuedChatSend {\n" +
      "  rawInput: string;\n" +
      "  channelType: ConversationChannelType;\n" +
      "  conversationId?: string | null;\n" +
      "  images?: ImageAttachment[];\n" +
      "  metadata?: Record<string, unknown>;\n" +
      "  resolve: () => void;\n" +
      "  reject: (error: unknown) => void;\n" +
      "}\n",
    replaceWith:
      "export interface QueuedChatSend {\n" +
      "  rawInput: string;\n" +
      "  channelType: ConversationChannelType;\n" +
      "  conversationId?: string | null;\n" +
      "  images?: ImageAttachment[];\n" +
      "  metadata?: Record<string, unknown>;\n" +
      "  // [tokagent surgical-patch] id of the user-bubble that sendChatText\n" +
      "  // already inserted into chat state synchronously. The queue task uses\n" +
      "  // this to skip a duplicate insert.\n" +
      "  optimisticUserMsgId?: string;\n" +
      "  resolve: () => void;\n" +
      "  reject: (error: unknown) => void;\n" +
      "}\n",
  },
  {
    path: "packages/app-core/src/state/useChatSend.ts",
    description:
      "Optimistically render the user's message bubble synchronously inside " +
      "sendChatText, BEFORE pushing to the serialized send queue. Sends are " +
      "serialized through chatSendQueueRef, so when an LLM stream from the " +
      "previous turn is still in flight (~30-60s on slow models), the next " +
      "queued send waits — and its user-bubble insert (in runQueuedChatSend) " +
      "is gated on the queue resuming. Users perceive a multi-minute delay " +
      "between pressing Enter and seeing their own message. Skip the " +
      "optimistic insert for slash/hash/dollar prefixed inputs since those " +
      "may be rewritten by tryHandlePrefixedChatCommand.",
    find:
      "  const sendChatText = useCallback(\n" +
      "    async (\n" +
      "      rawInput: string,\n" +
      "      options?: {\n" +
      "        channelType?: ConversationChannelType;\n" +
      "        conversationId?: string | null;\n" +
      "        images?: ImageAttachment[];\n" +
      "        metadata?: Record<string, unknown>;\n" +
      "      },\n" +
      "    ) => {\n" +
      "      const hasAttachedImages = Boolean(options?.images?.length);\n" +
      "      if (!rawInput.trim() && !hasAttachedImages) {\n" +
      "        return;\n" +
      "      }\n" +
      "\n" +
      "      await new Promise<void>((resolve, reject) => {\n" +
      "        chatSendQueueRef.current.push({\n" +
      "          rawInput,\n" +
      "          channelType: options?.channelType ?? \"DM\",\n" +
      "          conversationId: options?.conversationId,\n" +
      "          images: options?.images,\n" +
      "          metadata: buildChatViewMetadata(tab, options?.metadata),\n" +
      "          resolve,\n" +
      "          reject,\n" +
      "        });\n" +
      "        setChatSending(true);\n" +
      "        void flushQueuedChatSends();\n" +
      "      });\n" +
      "    },\n" +
      "    [flushQueuedChatSends, setChatSending, tab],\n" +
      "  );\n",
    replaceWith:
      "  const sendChatText = useCallback(\n" +
      "    async (\n" +
      "      rawInput: string,\n" +
      "      options?: {\n" +
      "        channelType?: ConversationChannelType;\n" +
      "        conversationId?: string | null;\n" +
      "        images?: ImageAttachment[];\n" +
      "        metadata?: Record<string, unknown>;\n" +
      "      },\n" +
      "    ) => {\n" +
      "      const hasAttachedImages = Boolean(options?.images?.length);\n" +
      "      if (!rawInput.trim() && !hasAttachedImages) {\n" +
      "        return;\n" +
      "      }\n" +
      "\n" +
      "      // [tokagent surgical-patch] optimistically render the user's\n" +
      "      // message bubble synchronously, BEFORE pushing to the serialized\n" +
      "      // send queue. Without this, the bubble waits for the previous\n" +
      "      // LLM stream to finish (queue is serial), so users see a\n" +
      "      // multi-minute delay before their message appears.\n" +
      "      let optimisticUserMsgId: string | undefined;\n" +
      "      const trimmedRawInput = rawInput.trim();\n" +
      "      const isPrefixedCommand = /^[\\/#$]/.test(trimmedRawInput);\n" +
      "      if (trimmedRawInput && !isPrefixedCommand) {\n" +
      "        const optimisticNow = Date.now();\n" +
      "        const optimisticNonce = Math.random().toString(36).slice(2, 8);\n" +
      "        optimisticUserMsgId = `temp-user-${optimisticNow}-${optimisticNonce}`;\n" +
      "        setCompanionMessageCutoffTs(optimisticNow);\n" +
      "        setConversationMessages((prev: ConversationMessage[]) => [\n" +
      "          ...prev,\n" +
      "          {\n" +
      "            id: optimisticUserMsgId as string,\n" +
      "            role: \"user\",\n" +
      "            text: trimmedRawInput,\n" +
      "            timestamp: optimisticNow,\n" +
      "          },\n" +
      "        ]);\n" +
      "      }\n" +
      "\n" +
      "      await new Promise<void>((resolve, reject) => {\n" +
      "        chatSendQueueRef.current.push({\n" +
      "          rawInput,\n" +
      "          channelType: options?.channelType ?? \"DM\",\n" +
      "          conversationId: options?.conversationId,\n" +
      "          images: options?.images,\n" +
      "          metadata: buildChatViewMetadata(tab, options?.metadata),\n" +
      "          optimisticUserMsgId,\n" +
      "          resolve,\n" +
      "          reject,\n" +
      "        });\n" +
      "        setChatSending(true);\n" +
      "        void flushQueuedChatSends();\n" +
      "      });\n" +
      "    },\n" +
      "    [\n" +
      "      flushQueuedChatSends,\n" +
      "      setChatSending,\n" +
      "      tab,\n" +
      "      setConversationMessages,\n" +
      "      setCompanionMessageCutoffTs,\n" +
      "    ],\n" +
      "  );\n",
  },
  {
    path: "packages/app-core/src/state/useChatSend.ts",
    description:
      "Dedup the user-message insert in runQueuedChatSend when sendChatText " +
      "already rendered the bubble optimistically. Reuses the optimistic id " +
      "(threaded through QueuedChatSend.optimisticUserMsgId) so subsequent " +
      "stream/reload logic continues to operate on a stable id.",
    find:
      "      const now = Date.now();\n" +
      "      const userMsgId = `temp-${now}`;\n" +
      "      const assistantMsgId = `temp-resp-${now}`;\n" +
      "\n" +
      "      setCompanionMessageCutoffTs(now);\n" +
      "      setConversationMessages((prev: ConversationMessage[]) => [\n" +
      "        ...prev,\n" +
      "        { id: userMsgId, role: \"user\", text, timestamp: now },\n" +
      "        { id: assistantMsgId, role: \"assistant\", text: \"\", timestamp: now },\n" +
      "      ]);\n",
    replaceWith:
      "      const now = Date.now();\n" +
      "      // [tokagent surgical-patch] reuse the optimistic user-msg id when\n" +
      "      // sendChatText already rendered the bubble; avoids a duplicate.\n" +
      "      const userMsgId = turn.optimisticUserMsgId ?? `temp-${now}`;\n" +
      "      const assistantMsgId = `temp-resp-${now}`;\n" +
      "\n" +
      "      setCompanionMessageCutoffTs(now);\n" +
      "      setConversationMessages((prev: ConversationMessage[]) => {\n" +
      "        const userAlreadyPresent = prev.some((m) => m.id === userMsgId);\n" +
      "        const next: ConversationMessage[] = [...prev];\n" +
      "        if (!userAlreadyPresent) {\n" +
      "          next.push({ id: userMsgId, role: \"user\", text, timestamp: now });\n" +
      "        }\n" +
      "        next.push({\n" +
      "          id: assistantMsgId,\n" +
      "          role: \"assistant\",\n" +
      "          text: \"\",\n" +
      "          timestamp: now,\n" +
      "        });\n" +
      "        return next;\n" +
      "      });\n",
  },
];

const UPSTREAM_COMPATIBILITY_FILES = [
  {
    path: "packages/shared/src/env-utils.impl.d.ts",
    sourceSibling: "packages/shared/src/env-utils.impl.ts",
    contents:
      "export declare function isTruthyEnvValue(value: string | undefined | null): boolean;\n",
  },
  {
    path: "packages/shared/src/env-utils.impl.js",
    sourceSibling: "packages/shared/src/env-utils.impl.ts",
    contents: `/**
 * Shared environment variable utilities (JavaScript module so Node ESM can resolve
 * \`./env-utils.impl.js\` when workspace packages load TypeScript sources directly).
 */

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/**
 * Returns true when value is a commonly-accepted truthy env string
 * (\`1\`, \`true\`, \`yes\`, \`on\` — case-insensitive, trimmed).
 * @param {string | undefined | null} value
 * @returns {boolean}
 */
export function isTruthyEnvValue(value) {
  if (value == null) return false;
  return TRUTHY.has(String(value).trim().toLowerCase());
}
`,
  },
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function ensureGitRepository(projectRoot: string): void {
  const gitDir = path.join(projectRoot, ".git");
  if (!fs.existsSync(gitDir)) {
    execFileSync("git", ["init", "-q"], { cwd: projectRoot });
  }
}

function isLocalRepoSpec(repo: string): boolean {
  return (
    path.isAbsolute(repo) ||
    repo.startsWith("./") ||
    repo.startsWith("../") ||
    repo.startsWith("file://")
  );
}

function withOptionalFileProtocol(repo: string, args: string[]): string[] {
  if (!isLocalRepoSpec(repo)) {
    return args;
  }
  return ["-c", "protocol.file.allow=always", ...args];
}

function resolveLocalRepoRoot(repo: string): string | undefined {
  if (!isLocalRepoSpec(repo)) {
    return undefined;
  }
  if (repo.startsWith("file://")) {
    return fileURLToPath(repo);
  }
  return path.resolve(repo);
}

function isBinaryFile(filePath: string, buffer: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return true;
  }
  return buffer.includes(0);
}

function replaceAll(
  text: string,
  replacements: Array<[string, string]>,
): string {
  let next = text;
  for (const [from, to] of replacements.sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    next = next.split(from).join(to);
  }
  return next;
}

function normalizeKebabCase(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "project";
}

export function toDisplayName(value: string): string {
  return normalizeKebabCase(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildPluginTemplateValues(input: {
  tokagentVersion: string;
  githubUsername: string;
  pluginDescription: string;
  projectName: string;
  repoUrl: string;
}): PluginTemplateValues {
  const slug = normalizeKebabCase(input.projectName);
  const pluginBaseName = slug.startsWith("plugin-") ? slug : `plugin-${slug}`;
  return {
    displayName: toDisplayName(pluginBaseName.replace(/^plugin-/, "")),
    tokagentVersion: input.tokagentVersion,
    githubUsername: input.githubUsername,
    pluginBaseName,
    pluginDescription: input.pluginDescription,
    pluginSnake: pluginBaseName.replace(/-/g, "_"),
    repoUrl: input.repoUrl,
  };
}

export function buildFullstackTemplateValues(
  projectName: string,
): FullstackTemplateValues {
  const projectSlug = normalizeKebabCase(projectName);
  const packageScope = projectSlug.replace(/[^a-z0-9]/g, "");
  const appName = toDisplayName(projectSlug);
  const appUrl = `https://example.com/${projectSlug}`;
  return {
    appName,
    appUrl,
    bugReportUrl: `https://github.com/your-org/${projectSlug}/issues/new`,
    bundleId: `com.example.${packageScope || "app"}`,
    docsUrl: `${appUrl}/docs`,
    fileExtension: `.${projectSlug}.agent`,
    hashtag: `#${appName.replace(/\s+/g, "")}`,
    orgName: "your-org",
    packageScope: packageScope || "app",
    projectSlug,
    releaseBaseUrl: `${appUrl}/releases/`,
    repoName: projectSlug,
  };
}

export function getPluginReplacementEntries(
  values: PluginTemplateValues,
): Array<[string, string]> {
  const rustPluginName = `rust-${values.pluginBaseName}`;
  const pythonPluginName = `python-${values.pluginBaseName}`;
  const pythonSnake = `python_${values.pluginSnake}`;
  return [
    [`\${PLUGINNAME}`, values.pluginBaseName],
    [`\${PLUGINDESCRIPTION}`, values.pluginDescription],
    [`\${GITHUB_USERNAME}`, values.githubUsername],
    [`\${REPO_URL}`, values.repoUrl],
    ["__TOKAGENTOS_VERSION__", values.tokagentVersion],
    ["@tokagentos/rust-plugin-starter", `@tokagentos/${rustPluginName}`],
    ["@elizaos/plugin-starter", `@tokagentos/${values.pluginBaseName}`],
    ["tokagentos_plugin_starter", `tokagentos_${values.pluginSnake}`],
    ["tokagentos-plugin-starter", `tokagentos-${values.pluginBaseName}`],
    ["rust_plugin_starter", `rust_${values.pluginSnake}`],
    ["python_plugin_starter", pythonSnake],
    ["rust-plugin-starter", rustPluginName],
    ["python-plugin-starter", pythonPluginName],
    ["plugin_starter", values.pluginSnake],
    ["plugin-starter", values.pluginBaseName],
    ["Plugin starter", `${values.displayName} plugin`],
    ["plugin starter", `${values.displayName.toLowerCase()} plugin`],
    [
      "plugin starter template",
      `${values.displayName.toLowerCase()} plugin template`,
    ],
  ];
}

export function getFullstackReplacementEntries(
  values: FullstackTemplateValues,
): Array<[string, string]> {
  return [
    ["__PROJECT_SLUG__", values.projectSlug],
    ["__APP_NAME__", values.appName],
    ["__APP_PACKAGE_NAME__", `${values.projectSlug}-app`],
    ["__ELECTROBUN_PACKAGE_NAME__", `${values.projectSlug}-electrobun`],
    ["__APP_URL__", values.appUrl],
    ["__BUG_REPORT_URL__", values.bugReportUrl],
    ["__BUNDLE_ID__", values.bundleId],
    ["__DOCS_URL__", values.docsUrl],
    ["__FILE_EXTENSION__", values.fileExtension],
    ["__HASHTAG__", values.hashtag],
    ["__ORG_NAME__", values.orgName],
    ["__PACKAGE_SCOPE__", values.packageScope],
    ["__RELEASE_BASE_URL__", values.releaseBaseUrl],
    ["__REPO_NAME__", values.repoName],
  ];
}

export function getTemplateReplacementEntries(options: {
  templateId: TemplateDefinition["id"];
  values: Record<string, string>;
}): Array<[string, string]> {
  if (options.templateId === "plugin") {
    return getPluginReplacementEntries(
      options.values as unknown as PluginTemplateValues,
    );
  }
  return getFullstackReplacementEntries(
    options.values as unknown as FullstackTemplateValues,
  );
}

export function resolveTemplateSourceDir(options: {
  language?: string;
  template: TemplateDefinition;
  templatesDir: string;
}): string {
  const templateRoot = path.join(options.templatesDir, options.template.id);
  if (options.template.id !== "plugin") {
    return templateRoot;
  }
  return path.join(templateRoot, options.language ?? "typescript");
}

function copyRenderedTreeInternal(
  sourceDir: string,
  destinationDir: string,
  replacements: Array<[string, string]>,
  managedFiles: Record<string, string>,
  rootDir: string,
): void {
  fs.mkdirSync(destinationDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name) || entry.name === "template.json") {
      continue;
    }

    const renderedEntryName = replaceAll(entry.name, replacements);
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, renderedEntryName);
    if (entry.isDirectory()) {
      copyRenderedTreeInternal(
        sourcePath,
        destinationPath,
        replacements,
        managedFiles,
        rootDir,
      );
      continue;
    }

    const relativePath = path.relative(rootDir, destinationPath);
    const buffer = fs.readFileSync(sourcePath);
    if (isBinaryFile(sourcePath, buffer)) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(destinationPath, buffer);
      managedFiles[relativePath] = sha256(buffer);
      continue;
    }

    const rendered = replaceAll(buffer.toString("utf-8"), replacements);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, rendered, "utf-8");
    managedFiles[relativePath] = sha256(rendered);
  }
}

export function renderTemplateTree(options: {
  destinationDir: string;
  replacements: Array<[string, string]>;
  sourceDir: string;
}): Record<string, string> {
  const managedFiles: Record<string, string> = {};
  copyRenderedTreeInternal(
    options.sourceDir,
    options.destinationDir,
    options.replacements,
    managedFiles,
    options.destinationDir,
  );
  return managedFiles;
}

export function createRenderedTempDir(options: {
  replacements: Array<[string, string]>;
  sourceDir: string;
}): { dir: string; managedFiles: Record<string, string> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokagentos-template-"));
  const managedFiles = renderTemplateTree({
    destinationDir: dir,
    replacements: options.replacements,
    sourceDir: options.sourceDir,
  });
  return { dir, managedFiles };
}

export function resolveTemplateUpstream(
  upstream: TemplateUpstream,
): TemplateUpstream {
  const hasEnvBranch = Object.hasOwn(process.env, "TOKAGENTOS_UPSTREAM_BRANCH");
  const hasEnvCommit = Object.hasOwn(process.env, "TOKAGENTOS_UPSTREAM_COMMIT");
  const envRepo = process.env.TOKAGENTOS_UPSTREAM_REPO?.trim();
  const envBranch = process.env.TOKAGENTOS_UPSTREAM_BRANCH?.trim();
  const envCommit = process.env.TOKAGENTOS_UPSTREAM_COMMIT?.trim();
  return {
    ...upstream,
    branch: hasEnvBranch ? envBranch || undefined : upstream.branch,
    commit: hasEnvCommit ? envCommit || undefined : upstream.commit,
    repo: envRepo || upstream.repo,
  };
}

export function ensurePackageJsonWorkspaces(
  packageJsonPath: string,
  workspaceEntries: string[],
): boolean {
  if (workspaceEntries.length === 0 || !fs.existsSync(packageJsonPath)) {
    return false;
  }

  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw) as { workspaces?: string[] };
  if (!Array.isArray(pkg.workspaces)) {
    return false;
  }

  let changed = false;
  for (const entry of workspaceEntries) {
    if (!pkg.workspaces.includes(entry)) {
      pkg.workspaces.push(entry);
      changed = true;
    }
  }

  if (!changed) {
    return false;
  }

  const indent = raw.match(/^(\s+)"/m)?.[1] || "  ";
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(pkg, null, indent)}\n`,
    "utf8",
  );
  return true;
}

export function removePackageJsonWorkspaces(
  packageJsonPath: string,
  workspaceEntries: readonly string[],
): boolean {
  if (workspaceEntries.length === 0 || !fs.existsSync(packageJsonPath)) {
    return false;
  }

  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw) as { workspaces?: string[] };
  if (!Array.isArray(pkg.workspaces)) {
    return false;
  }

  const removalSet = new Set(workspaceEntries);
  const filtered = pkg.workspaces.filter((entry) => !removalSet.has(entry));
  if (filtered.length === pkg.workspaces.length) {
    return false;
  }

  pkg.workspaces = filtered;
  const indent = raw.match(/^(\s+)"/m)?.[1] || "  ";
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(pkg, null, indent)}\n`,
    "utf8",
  );
  return true;
}

/**
 * Remove upstream paths that pull in workspace dependencies Tokagent does not
 * ship. Called after `git submodule update --init --recursive` hydrates the
 * upstream tree but before bun install runs. Returns the list of paths that
 * were actually removed so the caller can log them.
 *
 * The upstream submodule is freshly cloned and is not part of the user's
 * commit history, so a plain rmSync is safe — there is no working-tree state
 * to preserve.
 */
/**
 * Strip the named entries from `dependencies`, `devDependencies`, and
 * `peerDependencies` in a package.json. Returns true if any removal occurred.
 * Used to scrub references to packages that we prune from the upstream tree
 * (e.g., `@elizaos/plugin-elizacloud`) so bun install doesn't fail trying
 * to resolve them as workspace deps.
 */
export function removePackageJsonDependencies(
  packageJsonPath: string,
  depNames: readonly string[],
): boolean {
  if (depNames.length === 0 || !fs.existsSync(packageJsonPath)) {
    return false;
  }

  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw) as Record<string, unknown>;

  let changed = false;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const block = pkg[field];
    if (block && typeof block === "object" && !Array.isArray(block)) {
      const map = block as Record<string, string>;
      for (const name of depNames) {
        if (Object.hasOwn(map, name)) {
          delete map[name];
          changed = true;
        }
      }
    }
  }

  if (!changed) {
    return false;
  }

  const indent = raw.match(/^(\s+)"/m)?.[1] || "  ";
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(pkg, null, indent)}\n`,
    "utf8",
  );
  return true;
}

/**
 * Apply all configured `UPSTREAM_DEPENDENCY_REMOVALS` against the freshly
 * hydrated upstream tree. Returns the list of package.json files that were
 * actually modified.
 */
export function pruneUpstreamPackageDependencies(
  submoduleRoot: string,
  removals: ReadonlyArray<{
    readonly path: string;
    readonly names: readonly string[];
  }> = UPSTREAM_DEPENDENCY_REMOVALS,
): string[] {
  const modified: string[] = [];
  for (const { path: relPath, names } of removals) {
    const target = path.join(submoduleRoot, relPath);
    if (removePackageJsonDependencies(target, names)) {
      modified.push(relPath);
    }
  }
  return modified;
}

/**
 * Rewrite `"workspace:*"` declarations to npm version pins for known-dead
 * `@elizaos/plugin-*` workspace deps. Run AFTER submodule init + pruning
 * so the package.json files we touch reflect the post-pruned tree.
 *
 * Returns the list of package.json paths (relative to submoduleRoot) that
 * were modified.
 */
export function rewriteUpstreamWorkspaceDeps(
  submoduleRoot: string,
  pins: Readonly<Record<string, string>> = UPSTREAM_PLUGIN_NPM_PINS,
): string[] {
  const modified: string[] = [];
  const skipDirs = new Set([
    "node_modules",
    "dist",
    ".git",
    "build",
    "coverage",
    ".turbo",
  ]);

  function rewriteOnePackageJson(
    filePath: string,
    pinMap: Readonly<Record<string, string>>,
  ): boolean {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      return false;
    }
    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return false;
    }
    let changed = false;
    for (const depKey of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
    ] as const) {
      const block = pkg[depKey] as Record<string, string> | undefined;
      if (!block || typeof block !== "object") continue;
      for (const [name, version] of Object.entries(block)) {
        if (version !== "workspace:*") continue;
        const pin = pinMap[name];
        if (!pin) continue;
        block[name] = pin;
        changed = true;
      }
    }
    if (changed) {
      const updated = `${JSON.stringify(pkg, null, 2)}\n`;
      fs.writeFileSync(filePath, updated);
    }
    return changed;
  }

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.name === "package.json") {
        const filePath = path.join(dir, entry.name);
        if (rewriteOnePackageJson(filePath, pins)) {
          modified.push(path.relative(submoduleRoot, filePath));
        }
      }
    }
  }

  walk(submoduleRoot);
  return modified;
}

/**
 * Strip `[submodule "<path>"] ... path = <path>` blocks out of the
 * upstream `.gitmodules` for the given submodule paths, so subsequent
 * `git submodule update --init --recursive` calls don't try to clone
 * them. Used to avoid fetching the cloud/ submodule whose pinned ref
 * is force-rewritten periodically and breaks scaffolds.
 *
 * If `.gitmodules` is missing or the entries aren't present, no-op.
 */
export function removeSubmodulesFromGitmodules(
  submoduleRoot: string,
  paths: readonly string[],
): void {
  const gitmodulesPath = path.join(submoduleRoot, ".gitmodules");
  if (!fs.existsSync(gitmodulesPath)) return;

  // Order matters: git operations read .gitmodules to look up submodule
  // info, so we must run them BEFORE we rewrite the file. Sequence:
  //   1. `git rm --cached <path>` — remove from git's index (still works
  //      because .gitmodules still has the entry).
  //   2. `git config --remove-section submodule.<path>` — drop cached
  //      .git/config entries.
  //   3. Rewrite .gitmodules to drop the [submodule "<path>"] block.
  //
  // After all three, git no longer knows about the submodule from any
  // angle, and `submodule update --init --recursive` won't try to fetch
  // its URL.
  for (const submodulePath of paths) {
    try {
      execFileSync(
        "git",
        ["rm", "--cached", "-rf", "--quiet", submodulePath],
        { cwd: submoduleRoot, stdio: "ignore" },
      );
    } catch {
      // Path not in index (e.g., already removed) — fine.
    }
    try {
      execFileSync(
        "git",
        ["config", "--remove-section", `submodule.${submodulePath}`],
        { cwd: submoduleRoot, stdio: "ignore" },
      );
    } catch {
      // No section configured yet — fine.
    }
  }

  // Now rewrite .gitmodules. Parse line-by-line as INI-ish: each
  // `[submodule "..."]` header starts a new block that runs until the
  // next header (or EOF). Drop blocks whose `path = ...` matches a
  // prune path; emit the rest.
  const lines = fs.readFileSync(gitmodulesPath, "utf8").split("\n");
  const removalSet = new Set(paths);

  type Block = { headerLine: string | null; bodyLines: string[]; path: string | null };
  const blocks: Block[] = [];
  let current: Block = { headerLine: null, bodyLines: [], path: null };

  const isSubmoduleHeader = (line: string) =>
    /^\[submodule\s+"/.test(line.trim());

  for (const line of lines) {
    if (isSubmoduleHeader(line)) {
      blocks.push(current);
      current = { headerLine: line, bodyLines: [], path: null };
      continue;
    }
    if (current.headerLine !== null) {
      const m = /^\s*path\s*=\s*(.+?)\s*$/.exec(line);
      if (m) current.path = m[1];
    }
    current.bodyLines.push(line);
  }
  blocks.push(current);

  let changed = false;
  const kept: Block[] = [];
  for (const block of blocks) {
    if (block.headerLine !== null && block.path && removalSet.has(block.path)) {
      changed = true;
      continue;
    }
    kept.push(block);
  }

  if (!changed) return;

  const out: string[] = [];
  for (const block of kept) {
    if (block.headerLine !== null) out.push(block.headerLine);
    out.push(...block.bodyLines);
  }
  fs.writeFileSync(gitmodulesPath, out.join("\n"), "utf8");
}

export function pruneUpstreamUnusedPaths(
  submoduleRoot: string,
  paths: readonly string[] = UPSTREAM_PRUNE_PATHS,
): string[] {
  const removed: string[] = [];

  for (const relativePath of paths) {
    const targetPath = path.join(submoduleRoot, relativePath);
    if (!fs.existsSync(targetPath)) {
      continue;
    }
    fs.rmSync(targetPath, { force: true, recursive: true });
    removed.push(relativePath);
  }

  return removed;
}

/**
 * Apply each `UPSTREAM_SURGICAL_PATCHES` entry as a literal find/replace on
 * the named upstream file. Throws if a patch's `find` string isn't present
 * (so we can't silently ship an unapplied surgical patch when upstream
 * shifts the surrounding code). Returns the list of paths actually edited.
 */
export function applyUpstreamSurgicalPatches(
  submoduleRoot: string,
  patches: ReadonlyArray<{
    readonly path: string;
    readonly description: string;
    readonly find: string;
    readonly replaceWith: string;
  }> = UPSTREAM_SURGICAL_PATCHES,
): string[] {
  const applied: string[] = [];
  for (const patch of patches) {
    const target = path.join(submoduleRoot, patch.path);
    if (!fs.existsSync(target)) {
      throw new Error(
        `[surgical-patch] target file missing: ${patch.path}\n` +
          `Patch description: ${patch.description}`,
      );
    }
    const before = fs.readFileSync(target, "utf8");
    if (!before.includes(patch.find)) {
      throw new Error(
        `[surgical-patch] find-string not present in ${patch.path}.\n` +
          `Upstream may have changed the matched span. Patch description:\n` +
          `  ${patch.description}\n` +
          `First 80 chars of find:\n  ${patch.find.slice(0, 80).replace(/\n/g, "\\n")}…`,
      );
    }
    // Single replacement — split-then-join asserts uniqueness of the match.
    const segments = before.split(patch.find);
    if (segments.length !== 2) {
      throw new Error(
        `[surgical-patch] find-string matched ${segments.length - 1} times in ${patch.path}; expected exactly 1.`,
      );
    }
    const after = segments.join(patch.replaceWith);
    fs.writeFileSync(target, after, "utf8");
    applied.push(patch.path);
  }
  return applied;
}

export function ensureUpstreamCompatibilityFiles(
  submoduleRoot: string,
): string[] {
  const created: string[] = [];

  for (const file of UPSTREAM_COMPATIBILITY_FILES) {
    const targetPath = path.join(submoduleRoot, file.path);
    if (fs.existsSync(targetPath)) {
      continue;
    }

    const sourceSiblingPath = path.join(submoduleRoot, file.sourceSibling);
    if (!fs.existsSync(sourceSiblingPath)) {
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, file.contents, "utf8");
    created.push(file.path);
  }

  return created;
}

export function buildMetadata(options: {
  cliVersion: string;
  language?: string;
  managedFiles: Record<string, string>;
  template: TemplateDefinition;
  values: Record<string, string>;
}): ProjectTemplateMetadata {
  const now = new Date().toISOString();
  return {
    cliVersion: options.cliVersion,
    createdAt: now,
    language: options.language,
    managedFiles: options.managedFiles,
    templateId: options.template.id,
    templateVersion: options.template.version,
    updatedAt: now,
    values: options.values,
  };
}

export function updateManagedFiles(options: {
  currentMetadata: ProjectTemplateMetadata;
  dryRun?: boolean;
  projectRoot: string;
  renderedDir: string;
  renderedManagedFiles: Record<string, string>;
}): {
  conflicts: string[];
  created: string[];
  deleted: string[];
  nextManagedFiles: Record<string, string>;
  unchanged: string[];
  updated: string[];
} {
  const conflicts: string[] = [];
  const created: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];
  const updated: string[] = [];
  const nextManagedFiles = { ...options.renderedManagedFiles };

  const previousFiles = options.currentMetadata.managedFiles;
  const allManagedPaths = new Set([
    ...Object.keys(previousFiles),
    ...Object.keys(options.renderedManagedFiles),
  ]);

  for (const relativePath of allManagedPaths) {
    const projectPath = path.join(options.projectRoot, relativePath);
    const renderedPath = path.join(options.renderedDir, relativePath);
    const previousHash = previousFiles[relativePath];
    const nextHash = options.renderedManagedFiles[relativePath];
    const hasCurrentFile = fs.existsSync(projectPath);
    const hasRenderedFile = fs.existsSync(renderedPath);
    const currentHash = hasCurrentFile
      ? sha256(fs.readFileSync(projectPath))
      : "";

    if (previousHash && !hasRenderedFile) {
      if (currentHash && currentHash !== previousHash) {
        conflicts.push(relativePath);
        delete nextManagedFiles[relativePath];
        continue;
      }
      deleted.push(relativePath);
      delete nextManagedFiles[relativePath];
      if (!options.dryRun && fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { force: true });
      }
      continue;
    }

    if (!previousHash && nextHash) {
      if (currentHash && currentHash !== nextHash) {
        conflicts.push(relativePath);
        continue;
      }
      created.push(relativePath);
      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(projectPath), { recursive: true });
        fs.copyFileSync(renderedPath, projectPath);
      }
      continue;
    }

    if (currentHash === previousHash) {
      if (currentHash === nextHash) {
        unchanged.push(relativePath);
        continue;
      }
      updated.push(relativePath);
      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(projectPath), { recursive: true });
        fs.copyFileSync(renderedPath, projectPath);
      }
      continue;
    }

    if (currentHash === nextHash) {
      unchanged.push(relativePath);
      continue;
    }

    conflicts.push(relativePath);
    delete nextManagedFiles[relativePath];
  }

  return {
    conflicts,
    created,
    deleted,
    nextManagedFiles,
    unchanged,
    updated,
  };
}

export function hydrateGitSubmoduleWorkspace(options: {
  dryRun?: boolean;
  projectRoot: string;
  upstream: TemplateUpstream;
}): void {
  if (options.dryRun) {
    return;
  }

  const submoduleRoot = path.join(options.projectRoot, options.upstream.path);
  if (!fs.existsSync(submoduleRoot)) {
    return;
  }

  // Upstream elizaos/eliza hardcodes `eliza/packages/...` paths in a
  // few runtime scripts (e.g., dev-ui.mjs spawning the dev-server). Our
  // template puts the submodule under `tokagent/` instead, so those
  // hardcoded paths would 404 at runtime. Create an `eliza` symlink
  // pointing at the submodule path so either name resolves.
  if (options.upstream.path !== "eliza") {
    const elizaAlias = path.join(options.projectRoot, "eliza");
    if (!fs.existsSync(elizaAlias)) {
      try {
        fs.symlinkSync(options.upstream.path, elizaAlias, "dir");
      } catch {
        // Non-fatal — upstream scripts that rely on the alias will
        // surface their own errors later if the symlink couldn't be
        // created (e.g., on filesystems that don't support symlinks).
      }
    }
  }

  const requiredSubmodules = options.upstream.requiredSubmodules ?? [];
  const localRepoRoot = resolveLocalRepoRoot(options.upstream.repo);

  // Strip the always-prune submodules out of .gitmodules BEFORE recursive
  // init. Particularly important for `cloud/` — upstream eliza pins a
  // commit on elizaOS/cloud that gets force-rewritten periodically, so
  // `git submodule update --init --recursive` fails with `not our ref`.
  // Since we delete those paths anyway via pruneUpstreamUnusedPaths,
  // skip cloning them.
  removeSubmodulesFromGitmodules(submoduleRoot, UPSTREAM_PRUNE_PATHS);

  // Init ALL remaining submodules recursively. The agent runtime
  // statically imports from many plugin submodules (plugin-agent-skills,
  // plugin-commands, plugin-cron, plugin-app-control, plugin-shell,
  // app-lifeops, plugin-browser-bridge, plugin-app-companion, …) so
  // skipping them breaks runtime imports. Tolerate failures here:
  // a transient submodule fetch error shouldn't block scaffold creation.
  // The required-submodule loop below re-attempts each explicitly.
  try {
    execFileSync(
      "git",
      ["submodule", "update", "--init", "--recursive"],
      { cwd: submoduleRoot, stdio: "inherit" },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[scaffold] recursive submodule init reported errors — continuing. ` +
        `Required submodules will be re-fetched individually below. ` +
        `Underlying error: ${msg.split("\n")[0]}`,
    );
  }

  for (const submodulePath of requiredSubmodules) {
    const command = ["submodule", "update", "--init", "--recursive"];
    let localSubmoduleRoot: string | undefined;

    if (localRepoRoot) {
      const candidate = path.join(localRepoRoot, submodulePath);
      if (fs.existsSync(candidate)) {
        execFileSync(
          "git",
          ["config", `submodule.${submodulePath}.url`, candidate],
          { cwd: submoduleRoot, stdio: "inherit" },
        );
        localSubmoduleRoot = candidate;
      }
    }

    if (localSubmoduleRoot) {
      command.push("--reference", localSubmoduleRoot);
    }
    command.push(submodulePath);
    try {
      execFileSync(
        "git",
        localSubmoduleRoot
          ? withOptionalFileProtocol(localSubmoduleRoot, command)
          : command,
        { cwd: submoduleRoot, stdio: "inherit" },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[scaffold] failed to init required submodule "${submodulePath}" — ` +
          `continuing. Some plugin functionality may be unavailable until ` +
          `the user runs "git submodule update --init ${submodulePath}" ` +
          `manually inside ${options.upstream.path}/. ` +
          `Underlying error: ${msg.split("\n")[0]}`,
      );
    }
  }

  // Drop upstream paths whose workspace dependencies aren't satisfiable in a
  // Tokagent scaffold (chiefly plugin-elizacloud, which references the
  // private `@elizaos/cloud-sdk` workspace). Then scrub leftover references
  // to those packages from sibling package.json files. Run before the
  // workspace package.json edits so the upstream package.json stays
  // consistent with the pruned tree.
  pruneUpstreamUnusedPaths(submoduleRoot);
  removePackageJsonWorkspaces(
    path.join(submoduleRoot, "package.json"),
    UPSTREAM_WORKSPACE_REMOVALS,
  );
  pruneUpstreamPackageDependencies(submoduleRoot);

  // Rewrite "workspace:*" → npm pins for known-dead @elizaos/plugin-*
  // packages so bun install resolves them from the registry rather than
  // looking for a workspace dir that doesn't exist.
  const rewritten = rewriteUpstreamWorkspaceDeps(submoduleRoot);
  if (rewritten.length > 0) {
    console.log(
      `[scaffold] Rewrote workspace:* → npm pin in ${rewritten.length} package.json file(s)`,
    );
  }

  ensurePackageJsonWorkspaces(
    path.join(submoduleRoot, "package.json"),
    options.upstream.requiredWorkspaces ?? [],
  );
  ensureUpstreamCompatibilityFiles(submoduleRoot);

  const patchResult = applyTokagentScaffoldPatches({
    dryRun: options.dryRun,
    submoduleRoot,
  });

  if (patchResult.missing.length > 0) {
    // Missing target dirs are expected when an upstream submodule failed
    // to clone (e.g., transient network error or a force-rewritten ref).
    // Warn but don't crash — the user can re-run if a critical patch was
    // skipped, and overlays for unrelated submodules don't need to block
    // scaffold creation.
    console.warn(
      `[scaffold-patches] Target paths missing — likely an upstream ` +
        `submodule didn't clone successfully. Skipping these overlays:\n  - ` +
        patchResult.missing.join("\n  - "),
    );
  }

  // Narrow surgical edits over the upstream files (post-overlay so they
  // can patch files we don't otherwise overlay). Throws loudly if the find
  // string drifted.
  if (!options.dryRun) {
    applyUpstreamSurgicalPatches(submoduleRoot);
  }
}

/**
 * Overlay Tokagent-specific patches onto a freshly-hydrated upstream clone.
 * Each file under `scaffold-patches/` is copied to the same relative path
 * inside `<submoduleRoot>/` (i.e., the user's `<project>/tokagent/` directory).
 *
 * Returns a list of relative paths that were overlaid so the caller can log
 * them. Conflicts (target path missing) throw with a clear error — upstream
 * reorganizations must be reconciled in scaffold-patches before the next
 * tokagentos release.
 */
export function applyTokagentScaffoldPatches(options: {
  dryRun?: boolean;
  submoduleRoot: string;
}): { applied: string[]; missing: string[] } {
  const applied: string[] = [];
  const missing: string[] = [];

  const patchesRoot = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "scaffold-patches",
  );

  if (!fs.existsSync(patchesRoot)) {
    // No patches declared — nothing to do.
    return { applied, missing };
  }

  const walk = (dir: string): string[] => {
    const entries: string[] = [];
    for (const name of fs.readdirSync(dir)) {
      if (SKIP_NAMES.has(name)) continue;
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        entries.push(...walk(full));
      } else if (stat.isFile()) {
        entries.push(full);
      }
    }
    return entries;
  };

  const patchFiles = walk(patchesRoot);

  for (const patchPath of patchFiles) {
    const relativePath = path.relative(patchesRoot, patchPath);
    // Exclude README.md from being overlaid — it's documentation.
    if (relativePath === "README.md") continue;

    const targetPath = path.join(options.submoduleRoot, relativePath);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
      // If the TOP-LEVEL dir is missing, the upstream layout has changed —
      // skip and warn. But intermediate directories within an established
      // top-level (e.g. `packages/billing/src/` when `packages/` exists)
      // are allowed: scaffold-patches can introduce whole new packages.
      const parts = relativePath.split(path.sep);
      const topLevelDir = path.join(options.submoduleRoot, parts[0]);
      if (!fs.existsSync(topLevelDir)) {
        missing.push(relativePath);
        continue;
      }
      if (!options.dryRun) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }

    if (options.dryRun) {
      applied.push(relativePath);
      continue;
    }

    fs.copyFileSync(patchPath, targetPath);
    applied.push(relativePath);
  }

  return { applied, missing };
}

export function initializeGitSubmodule(options: {
  branch?: string;
  commit?: string;
  projectRoot: string;
  repo: string;
  submodulePath: string;
}): void {
  ensureGitRepository(options.projectRoot);

  const submoduleRoot = path.join(options.projectRoot, options.submodulePath);
  if (fs.existsSync(submoduleRoot)) {
    return;
  }

  const args = ["submodule", "add", "--depth", "1"];
  const localRepoRoot = resolveLocalRepoRoot(options.repo);
  if (localRepoRoot) {
    args.push("--reference", localRepoRoot);
  }
  if (options.branch?.trim()) {
    args.push("-b", options.branch.trim());
  }
  args.push(options.repo, options.submodulePath);
  execFileSync("git", withOptionalFileProtocol(options.repo, args), {
    cwd: options.projectRoot,
    stdio: "inherit",
  });

  // If a commit pin is set, fetch and check it out so the submodule's
  // working tree is locked to a vetted upstream SHA, immune to future
  // upstream pushes on the tracked branch. We have to fetch explicitly
  // because `submodule add --depth 1 -b <branch>` only retrieves the
  // branch tip — older pinned commits aren't in the local objects.
  const commit = options.commit?.trim();
  if (commit) {
    execFileSync(
      "git",
      ["fetch", "--depth", "1", "origin", commit],
      { cwd: submoduleRoot, stdio: "inherit" },
    );
    execFileSync(
      "git",
      ["checkout", "--detach", commit],
      { cwd: submoduleRoot, stdio: "inherit" },
    );
  }
}

export function updateGitSubmodule(options: {
  branch?: string;
  commit?: string;
  dryRun?: boolean;
  projectRoot: string;
  repo: string;
  submodulePath: string;
}): void {
  if (options.dryRun) {
    return;
  }

  ensureGitRepository(options.projectRoot);
  const submoduleRoot = path.join(options.projectRoot, options.submodulePath);
  if (!fs.existsSync(submoduleRoot)) {
    initializeGitSubmodule({
      branch: options.branch,
      commit: options.commit,
      projectRoot: options.projectRoot,
      repo: options.repo,
      submodulePath: options.submodulePath,
    });
    return;
  }

  const localRepoRoot = resolveLocalRepoRoot(options.repo);
  const commit = options.commit?.trim();
  if (commit) {
    // Pinned mode: ignore --remote (which follows branch HEAD) and
    // force-checkout the pinned SHA so existing scaffolds stay locked
    // to the same upstream state as fresh ones.
    execFileSync(
      "git",
      ["fetch", "--depth", "1", "origin", commit],
      { cwd: submoduleRoot, stdio: "inherit" },
    );
    execFileSync(
      "git",
      ["checkout", "--detach", commit],
      { cwd: submoduleRoot, stdio: "inherit" },
    );
    return;
  }

  execFileSync(
    "git",
    withOptionalFileProtocol(options.repo, [
      "submodule",
      "update",
      "--init",
      "--remote",
      ...(localRepoRoot ? ["--reference", localRepoRoot] : []),
      options.submodulePath,
    ]),
    { cwd: options.projectRoot, stdio: "inherit" },
  );
}
