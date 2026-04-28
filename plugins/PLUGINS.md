# Tokagent Plugin Set — Engineering Reference

Reference doc for the 5 `plugin-tokagent-*` plugins shipped with the tokagentos CLI (alpha.263+). For project-level conventions (build, sync, ship), see `tokagentos/CLAUDE.md` and root `README.md` — this doc deliberately does not duplicate them.

---

## 1. Overview

Tokagent is a vault-mediated, non-zkp DeFi automation product layered on top of the eliza/tokagentos agent runtime. The user's agent owns a `TokagentVault` smart contract on each supported chain. Every on-chain action — Hyperliquid perps, Aave deposits, future Polymarket trades — is dispatched through `vault.executeBatch(...)` against a pre-allowlisted `(target, selector)` set, so the agent's hot-key cannot escape its policy. The plugin set is responsible for: (a) discovering vault state on every turn, (b) deploying new vaults, (c) composing/persisting Strategy objects from natural language, (d) issuing the on-chain calls.

The plugin set is split into 5 packages with a strict dependency direction: `shared` is the base; the four product plugins (`strategy`, `perps`, `polymarket`, `yield`) all depend on it and never on each other.

```
                 plugin-tokagent-shared
                 (chains, ABIs, clients, packs, wallet, action-result, env-persistence)
                /        |          |             \
   tokagent-strategy  tokagent-perps  tokagent-polymarket  tokagent-yield
   (orchestrator,     (Hyperliquid    (markets read,        (Aave v3
    deploy,            CoreWriter      buy/sell/redeem       deposit/
    BUILD/START/        via vault       — mostly read         withdraw
    STOP, vault-       allowlist)      today)                 via vault)
    context provider)
```

Action dispatch flow per chat turn:

1. Eliza assembles prompt context — `vaultContext` + `activeStrategies` providers run unconditionally and inject `[vault-context]` / `Active strategies (...)` blocks.
2. LLM picks zero or more action names from the registered `actions[]` of all loaded plugins; eliza validates via each action's `validate()`.
3. For each picked action, eliza calls `handler(runtime, message, state, options)` with parameters extracted from the user message + LLM JSON.
4. Handlers that touch chain do exactly two viem RPC operations: a write through `WalletClient.writeContract` + a `waitForTransactionReceipt`. Read-only actions never instantiate `WalletClient`.
5. Handler returns an `ActionResult` (`success`, optional `text`, optional `data`); `text` is appended into the chat as the assistant's reply unless suppressed (see §2 action-result helpers).

Every plugin tree mirrors the same skeleton: `src/index.ts` exports a `Plugin` literal with `actions`, `providers`, optional `services`. Plugins do not register chains — the chain set is a constant in `plugin-tokagent-shared/src/chain-config.ts`.

---

## 2. Plugin: plugin-tokagent-shared

The foundation. No actions, no providers — pure utility. Every other tokagent plugin imports from `@tokagent/plugin-tokagent-shared`. Public surface lives in `src/index.ts`; exporting from anywhere else is a breaking change candidate.

### 2.1 Chain config (`src/chain-config.ts`)

Three chains, hard-coded:

| Chain | chainId | Factory proxy | Native | Default RPC |
|-------|---------|---------------|--------|-------------|
| Ethereum | 1 | `0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39` | ETH | `ethereum-rpc.publicnode.com` |
| Polygon | 137 | `0x0eDa0bCFBFc51Ab245F078AEFa3ee42cB384c865` | MATIC | `polygon-bor-rpc.publicnode.com` |
| HyperEVM | 999 | `0xd27A7470a34903b7e215EA8d07d9cd2d21238F83` | HYPE | `rpc.hyperliquid.xyz/evm` |

Factory proxy addresses are sourced from `sdk/src/addresses.ts` (`DEPLOYMENTS` map). When the SDK redeploys, this file must be updated by hand — there is no auto-import. `getChainConfig(chainId)` throws on unknown chains; `SUPPORTED_CHAIN_IDS` is the canonical iteration set used by `vault-context`, `GET_TOKAGENT_STATUS`, and the chain-name parsers in `deploy-vault` / `build-strategy`.

### 2.2 Wallet & private-key resolution (`src/wallet.ts`)

`getPublicClient(chainId, rpcOverride?)` returns a viem `PublicClient` over `http()`; `getWalletClient(chainId, privateKey, rpcOverride?)` returns one signed by the given key. Both are read-bound to the chain's default RPC unless overridden — there is no chain object on the client (`chain: null` is passed to writes via `walletClient.chain ?? null`), so a misconfigured RPC will not silently re-route to the wrong network.

`resolveAgentPrivateKey(runtime)` is the **3-tier lookup** every action uses (added in alpha.262 to fix the "private key not configured" cliff that hit users with only `EVM_PRIVATE_KEY` set):

1. `runtime.getSetting('TOKAGENT_PRIVATE_KEY')` — character/runtime config.
2. `process.env.TOKAGENT_PRIVATE_KEY` — preferred .env knob.
3. `process.env.EVM_PRIVATE_KEY` — `@elizaos/plugin-evm` alias, mirrored by `core-plugins.ts`.

The function trims, requires `0x`-prefixed hex, asserts exactly 64 hex chars after the prefix, and returns `Hex`. Anything else throws a clear error string the action can paste into `tokagentActionFailure`.

### 2.3 Action-result helpers (`src/action-result.ts`)

eliza's chat runtime treats `ActionResult.text` as the assistant's reply, so a verbose validation error like `"Invalid vaultAddress 0x.., expected 40 hex chars"` overrides the LLM's natural reply and the chat looks broken. The two helpers exist to encode WHEN to suppress that message:

| Helper | When to use | What it returns | Effect on chat |
|---|---|---|---|
| `tokagentActionError(reason, detail?)` | LLM-recoverable input validation — missing param, invalid chain name, bad address shape, params the LLM should retry with. | `{ success: false, data: { reason, ...detail } }` — **no `text`**. | Eliza's `normalizeActionCallbackText` skips empty text, so the LLM's natural-language reply remains the assistant message. The LLM still has `data.reason` for retry decisions. |
| `tokagentActionFailure(reason, userFacingMessage, detail?)` | Genuine on-chain or system failure the user *must* see — RPC down, deploy reverted, kind not registered, vault deploy succeeded but post-tx parsing failed. | `{ success: false, text, data }`. | `text` is the assistant message. Keep it terse, single line, no stack trace. |

Rule of thumb: if the LLM could fix it by re-prompting (missing param, wrong chain spelling), `tokagentActionError`. If the LLM cannot fix it without telling the user (RPC down, contract reverted, key missing), `tokagentActionFailure`. The two functions sit at `plugin-tokagent-shared/src/action-result.ts:30-59`.

### 2.4 TokagentFactoryClient (`src/clients/TokagentFactoryClient.ts`)

Minimal viem-typed client over the *non-zkp* subset of `VaultFactory`. Methods: `deployTokagentVault`, `computeTokagentVaultAddress`, `isDeployedVault`, `getAllVaults`, `vaultCount`. Accepts an optional `WalletClient`; reads work without one, writes throw if missing.

`deployTokagentVault` is the load-bearing path. The flow at `TokagentFactoryClient.ts:139-204`:

1. Map `AllowlistEntry[]` and `ApprovalSpec[]` to the on-chain tuple types. Approval `amount` is forced to `uint256.max` regardless of input — packs do not parameterize it.
2. Compute the predicted CREATE2 address via `computeTokagentVaultAddress` *before* the tx. This is the alpha.263 fallback hook.
3. Send the write, await the receipt.
4. Try `parseEventLogs({ abi, eventName: 'TokagentVaultDeployed', logs: receipt.logs })`. If exactly one log decodes, return its `args.vault`.
5. **Fallback (alpha.263)**: if the event decoder returns 0 logs, call `isDeployedVault(predicted)`. If true, return the predicted address. Only if both fail does the throw fire — and the message includes the full receipt logs JSON for debugging.

**The 2026-04-28 ABI fix.** The `TokagentVaultDeployed` event ABI was previously wrong — it had a different parameter shape (3 params, missing `salt` and `kind`), so `parseEventLogs` returned `[]` even on successful deploys, and the only path forward was to throw with the receipt dump. The fix in `TokagentFactoryClient.ts:95-106` aligns the event tuple with the canonical interface:

```
event TokagentVaultDeployed(
    address indexed vault,
    address indexed owner,
    address indexed operator,
    uint256 salt,
    bytes32 kind
);
```

Authoritative sources: `contracts/src/interfaces/IVaultFactory.sol:173-179` and `sdk/src/abi/VaultFactory.ts:1166-1196`. Both list 5 params (vault/owner/operator indexed, salt/kind unindexed). To verify alignment going forward, diff the event in `TokagentFactoryClient.ts` against `sdk/src/abi/VaultFactory.ts` whenever the SDK regenerates ABIs — they should be byte-identical aside from JSON formatting. The `isDeployedVault` fallback was added in the same fix as belt-and-braces protection: if event decoding ever drifts again (RPC strips logs, ABI variant lands), the deterministic CREATE2 prediction guarantees the deploy is still recoverable.

### 2.5 TokagentVaultClient (`src/clients/TokagentVaultClient.ts`)

Thin per-vault client. Reads: `owner()`, `operator()`, `vaultKind()`, `isAllowlisted(target, selector)`. Writes (require `walletClient`): `executeBatch(calls)` — the universal entry every product plugin uses to dispatch on-chain action — and `approveToken(token, spender, amount)` for ERC-20 approval top-ups beyond what the pack pre-seeded. `TokagentCall = { target, data, value }`; the perps and yield plugins both call `executeBatch([call])` with a single-element array (perps in `actions/open-perp-position.ts:244`, yield in `actions/deposit-to-aave.ts:114`).

### 2.6 Protocol packs (`src/protocol-packs.ts`)

A `ProtocolPack` is a curated bundle of allowlist entries + ERC-20 approvals for one DeFi protocol on one chain. Shape:

```
ProtocolPack {
  id: string;          // 'aave-v3-polygon'
  chainId: number;     // 137
  displayName: string; // 'Aave v3 on Polygon'
  entries:   AllowlistEntry[];   // { target, selector: 4-byte hex, humanLabel }
  approvals: ApprovalSpec[];     // { token, spender, humanLabel }
}
```

Two packs ship today:

| Pack id | Chain | Targets / selectors | Approvals |
|---|---|---|---|
| `aave-v3-polygon` | 137 | Aave v3 `Pool` (`0x794a61358D6845594F94dc1DB02A252b5b4814aD`) — `supply`/`withdraw`/`borrow`/`repay`. | USDC.e (`0x2791…4174`) → Pool, max. |
| `hyperliquid-perps-hyperevm` | 999 | `TokagentHyperEvmHelper` (`0x83507777…58171c`) — `bridgeHype(uint256)` selector `0xf4e0b185`, `dispatchCoreWriter(bytes)` selector `0xa62c829a`. | none. |

Both pack contents must mirror the Rust CLI source of truth at `crates/tal-cli/src/tokagent_packs.rs` (see comment at `protocol-packs.ts:28`). Selectors are 4-byte hex; do not regenerate them ad-hoc — keep them aligned with the deployed contract.

**Adding a new pack:** (1) append a new `const FOO_BAR: ProtocolPack` to `protocol-packs.ts`, (2) add it to the `PACKS` array, (3) update the Rust CLI mirror, (4) update `DEFAULT_PACKS_BY_CHAIN_ID` in `actions/deploy-vault.ts:100-104` if the new pack should be the chain default, (5) optionally surface a new product plugin or new actions in an existing one. `findPack(id, chainId)` and `listPacksForChain(chainId)` are the only lookups; both are O(n) over `PACKS` and that's fine because n is small.

### 2.7 env-persistence (`src/env-persistence.ts`)

`persistVaultAddress(runtime, chainId, vault)` is a best-effort dual-write: it tries `runtime.setSetting('TOKAGENT_VAULT_ADDRESS_<chainId>', vault)` first (in-memory), then mirrors the same KV to the on-disk `.env` resolved from `process.env.DOTENV_PATH` ?? `<cwd>/.env`. Disk failures are warned, never thrown — never undo a successful on-chain deploy because of an `fs.writeFileSync` glitch.

`upsertEnvLine(content, key, value)` is the deterministic in-place editor: it preserves blank lines, comments, and ordering; replaces a single existing line; appends if absent; normalizes trailing newline. It does NOT support `export KEY=...` syntax. Exported for unit tests.

`risk.ts` exports slippage and approval-cap constants (`MAX_APPROVAL`, `DEFAULT_SLIPPAGE_BPS`, `BPS_DENOMINATOR`, `applySlippageDown/Up`, `validateSlippageBps`) — used by perps but not strategy, kept here so any future product plugin gets the same primitives.

---

## 3. Plugin: plugin-tokagent-strategy

The orchestrator. Entrypoint at `plugin-tokagent-strategy/src/index.ts:26-46`. Registers 7 actions, 2 providers, 1 service (`StrategyRunnerService` — periodic tick loop, `serviceType = "tokagent-strategy-runner"`). On `init`, `registerBuiltinKinds()` registers the 3 strategy kind impls (yield-auto-compound, polymarket-value-hunt, perp-funding-arb) into a module-level `kind-registry`.

### 3.1 Action: `DEPLOY_TOKAGENT_VAULT`

File: `actions/deploy-vault.ts`. The full call flow:

1. **Validate.** `validate()` only checks `resolveAgentPrivateKey` succeeds (no chain-RPC ping). Returning `false` causes eliza to skip the action entirely with no chat trace.
2. **Defaults.** If `chain` is missing → `'hyperevm'`. If `packs` is missing → per-chain default: hyperevm→`['hyperliquid-perps-hyperevm']`, polygon→`['aave-v3-polygon']`, ethereum→`[]` (table at `deploy-vault.ts:100-104`). Operator defaults to the wallet account address derived from `TOKAGENT_PRIVATE_KEY`.
3. **Pack resolution.** For each pack id, `findPack(pid, chainId)` — unknown id → `tokagentActionFailure('unknown_pack', …)`. Concatenate `entries` and `approvals` across all packs.
4. **Wallet wiring.** `getPublicClient(chainId)` + `getWalletClient(chainId, privateKey)` + `new TokagentFactoryClient(chainConfig.factoryProxy, public, wallet)`.
5. **Random `userSalt`.** 64 hex chars from `Math.random()` — fine for de-duplication, not a security primitive (CREATE2 collisions across operators are infeasible regardless).
6. **`factory.deployTokagentVault(...)`** — see §2.4 for receipt parsing + isDeployedVault fallback.
7. **Persistence.** On success the action calls `runtime.setSetting('TOKAGENT_VAULT_ADDRESS_<chainId>', vault)` directly (in-memory only — `deploy-vault.ts:186-198`). It does NOT call `persistVaultAddress` from shared; this is a known gap that the alpha.263 work is closing — once that ships, the deployed vault should survive restart via `.env`. If the setting write fails the deploy is still considered successful and a warning is logged (we never want to undo an on-chain success).
8. **Return.** `{ success: true, text: "Vault deploy CONFIRMED on-chain on <chain> at <vault>. ...", data: { vault, txHash, chainId, operator, packs } }`.

Default parameters table:

| Param | Required | Default | Schema |
|---|---|---|---|
| `chain` | no | `hyperevm` | enum `ethereum`/`polygon`/`hyperevm` (also `mainnet`/`eth`/`matic`/`hyper`). |
| `packs` | no | per-chain default (table above) | array of pack ids. |
| `operator` | no | wallet account address | `0x…` address. |

**Two-turn LLM contract.** `examples` (`deploy-vault.ts:220-326`) trains the model on a strict pattern: **turn 1** is a future-tense proposal ending with a confirmation question and `actions: []` — the model commits to nothing and the action does not fire. **Turn 2**, after the user confirms, emits `actions: ["DEPLOY_TOKAGENT_VAULT"]`. Never use "I'm deploying now" on the proposal turn — that becomes a lie until the receipt confirms.

### 3.2 Action: `BUILD_STRATEGY`

File: `actions/build-strategy.ts`. Composes a `Strategy` JSON object from a free-form goal description by calling `runtime.useModel(ModelType.TEXT_LARGE, …)` with a constrained system prompt (`build-strategy.ts:32-72`). Three kinds, picked by the LLM:

| Kind | params schema | scheduleEveryMs default | Default vault chain |
|---|---|---|---|
| `yield-auto-compound` | `{ asset: 'USDC', minHarvestAmount: number, targetApy?: number }` | 86_400_000 (24h) | polygon (137) — Aave |
| `polymarket-value-hunt` | `{ minMarketVolume: number, minMispricingPct: number, maxMarkets: number (≤20) }` | 3_600_000 (1h) | (chain-agnostic; user picks vault) |
| `perp-funding-arb` | `{ symbols: string[] (2..10), minFundingSpreadBps: number, maxPositionUsd: number }` | 3_600_000 (1h) | hyperevm (999) — Hyperliquid |

Pipeline (`build-strategy.ts:241-326`): (1) call LLM, (2) `extractJson` (slice between first `{` and last `}`), (3) `validateLLMOutput` checks structural shape + valid kind + scheduleEveryMs ≥ 60_000, (4) `kindImpl.paramSchema.safeParse(shape.params)` runs the kind's zod validator, (5) build `Strategy` with `id = randomUUID()`, `status = 'draft'`, `tickHistory = []`, persist via `saveStrategy(rl, strategy)`.

Vault resolution (`build-strategy.ts:215-239`): explicit `vaultAddress` param wins; otherwise reads `TOKAGENT_VAULT_ADDRESS_<chainId>` from runtime settings. If neither is set → `tokagentActionFailure('no_vault_for_chain', …)` telling the user to run `DEPLOY_TOKAGENT_VAULT` first. If shape is bad → `tokagentActionFailure('invalid_vault_address', …)`. Never silently invents an address — the original `0x123…` hallucination bug was the reason the `vault-context` provider exists.

### 3.3 Action: `REGISTER_EXISTING_VAULT` (alpha.263)

> **TBD: peer hasn't shipped yet** — as of this writing, `actions/register-existing-vault.ts` is not present on disk. Forward reference: when shipped, the action's contract should be: input `{ chain, vaultAddress }`; handler verifies on-chain via `factory.isDeployedVault(vaultAddress)` (or `vault.owner()` matches the operator hot-key); on success, persists `TOKAGENT_VAULT_ADDRESS_<chainId>` via `persistVaultAddress(runtime, chainId, vault)` so it shows up in `vault-context` immediately and survives restart. This is the recovery action when an LLM/user has a vault on-chain but the runtime forgot it (event-decode failure pre-alpha.263, restart with no `.env` mirror, agent rehosted on a new machine). The LLM should call it when the user provides a vault address that isn't already in `[vault-context]`.

### 3.4 Other strategy actions (one-line summaries)

- `GET_TOKAGENT_STATUS` (`actions/get-tokagent-status.ts`) — discovery snapshot. No params. Returns `{ vaults[per-chain], wallet, strategiesByStatus, supportedChains, supportedKinds, availableActions }`. The LLM should call this first when the user opens with a vague question.
- `LIST_STRATEGIES` (`actions/list-strategies.ts`) — enumerates persisted strategies (id, name, kind, status, vault, last-tick); call before START/STOP/BACKTEST when the user refers by description not id.
- `START_STRATEGY` (`actions/start-stop.ts`) — flips a draft to `testing` (default) or `active`. Param `id` required, `mode` optional.
- `STOP_STRATEGY` (`actions/start-stop.ts`) — flips status to `stopped`. Permanent — for temporary suspension a future `pause` action would be needed.
- `BACKTEST_STRATEGY` (`actions/backtest-strategy.ts`) — replays the kind's evaluator over `days` (default 30) of historical data, returns hypothetical pnl/sharpe/drawdown, persists into `strategy.backtestResults` (capped at 5 most recent). Not all kinds implement it — `kindImpl.backtest` is optional.

### 3.5 Provider: `vaultContext`

File: `providers/vault-context.ts:69-125`. Runs every chat turn. No network calls — reads only runtime settings + the strategy persistence layer. Emits a compact `[vault-context]` block (≈12 lines) the LLM sees in every prompt:

```
[vault-context]
Vaults: none deployed yet — call DEPLOY_TOKAGENT_VAULT before any strategy/trade actions.
Wallet: EVM=0xabc…; Solana=not configured
Strategies: 0 (call BUILD_STRATEGY to compose one once a vault exists)
```

When ≥1 vault exists, it lists each as `  - <chain-slug>: <0x-address>` and lists chains without a vault under `Other supported chains (no vault): …`. The strategies count comes from `listActiveStrategies(reader)`; on failure (uninitialized persistence, fresh session) it falls back to `(status unavailable this turn)` rather than throwing.

The data shape returned alongside `text`: `{ vaults: [{ chain, address|null }, …], wallet: { evm, solana }, strategyCount: number }` — accessible to the LLM for structured decisions.

**Read sources.** `TOKAGENT_VAULT_ADDRESS_<chainId>` for each chain in `SUPPORTED_CHAIN_IDS`; `TOKAGENT_MANAGED_EVM_ADDRESS` (or fallback `EVM_WALLET_ADDRESS`) for EVM display; `SOLANA_WALLET_ADDRESS` for Solana display. Settings are populated by (a) the deploy action (in-memory), (b) `persistVaultAddress` (in-memory + .env mirror), (c) the operator's `.env` directly. Missing the .env mirror means restart wipes vault visibility — that's the alpha.263 gap §3.1 closes.

**Gotchas (flagged by the AI architect):** (1) the provider reads cached settings, not the chain — if a vault was deployed *outside* the agent (script, prior process), it won't show up unless `TOKAGENT_VAULT_ADDRESS_<chainId>` is set; the recovery is `REGISTER_EXISTING_VAULT`. (2) the LLM may anchor on the `[vault-context]` block too hard — if the user explicitly passes a different `vaultAddress`, that wins; the provider is hint, not policy.

`activeStrategies` provider (`providers/strategies.ts`) is separate — it lists only active/testing strategies as a follow-up nudge.

---

## 4. Plugin: plugin-tokagent-perps

Hyperliquid perpetuals via vault allowlist. `src/index.ts` registers 3 actions and 1 provider. All writes go through `vault.executeBatch([{target: helper, data: <calldata>, value: 0}])`. The vault must have the `hyperliquid-perps-hyperevm` pack pre-allowlisted; if not, the on-chain revert message contains `CallNotAllowlisted` and the action's catch block surfaces a remediation hint (`open-perp-position.ts:247-253`).

| Action | What it writes |
|---|---|
| `GET_PERPS_MARKET_INFO` | None — REST call to `api.hyperliquid.xyz/info` for `meta`/`metaAndAssetCtxs`. Returns markPx, funding rate, OI, szDecimals for one symbol. |
| `OPEN_PERP_POSITION` | One `vault.executeBatch([call])` where `call = buildLimitOrderCall({ symbol, side, sizeUsd, markPx, assetIndex, szDecimals, helperAddress, … })` — the helper's `dispatchCoreWriter(bytes)` selector with an encoded CoreWriter limit-order action. Helper address resolved from `TOKAGENT_HYPERLIQUID_HELPER_ADDRESS` setting; placeholder `0x0…0` triggers the deploy-instruction error. |
| `CLOSE_PERP_POSITION` | Same path as `OPEN_…` but with reverse side and `reduceOnly` semantics handled by the price-band logic — the close is just another limit order. |

Vault address resolution (`open-perp-position.ts:51-56`): `TOKAGENT_VAULT_ADDRESS_999` first, falls back to legacy `TOKAGENT_VAULT_ADDRESS`. If absent → action returns failure asking the user to deploy. Provider `hyperliquidPositionsProvider` reads vault sub-account positions from the Hyperliquid API and injects them into context.

Encoders (`corewriter.ts`, exported from `src/index.ts:21-34`): `encodeCoreWriterLimitOrder`, `encodeCoreWriterUsdClassTransfer`, `encodeCoreWriterSpotSend` plus action-id and TIF constants. Header format follows the official `abi.encodePacked(uint8(1), uint24(actionId), abi.encode(params...))`. Amount-scaling gotchas (1e6 vs 1e8 across actions, async settlement, HYPE gas requirement, leverage-zero precondition) are all CoreWriter-side concerns; see `MEMORY.md` "CoreWriter" entries for the canonical war stories.

---

## 5. Plugin: plugin-tokagent-polymarket

Currently scoped to read-only market discovery. `src/index.ts` registers 1 action and 1 provider:

| Action | What it writes |
|---|---|
| `DESCRIBE_POLYMARKET_MARKET` | None — REST call to `gamma-api.polymarket.com`. Resolves a market by `query` (slug, condition id, or free-text) and returns title, outcomes (parsed from the JSON-in-JSON `outcomes`/`outcomePrices` fields), volume, status, end date. |

The user-instruction sketch (buy/sell/redeem) is **not on disk yet**. Forward-looking: a buy action would route through the vault with a Polymarket exchange contract pre-allowlisted (no pack ships today). Provider `polymarketPositionsProvider` reads the operator's existing Polymarket positions for context.

> **TBD: peer hasn't shipped yet** — `BUY_POLYMARKET`, `SELL_POLYMARKET`, `REDEEM_POLYMARKET` actions and the `polymarket-*` ProtocolPack are referenced in the user spec but absent from `plugins/plugin-tokagent-polymarket/src/actions/`. When added, expect the same pattern as yield/perps: `vault.executeBatch([call])`, vault-allowlist entries seeded by a new pack, vaultAddress resolved per-chain.

---

## 6. Plugin: plugin-tokagent-yield

Aave v3 on Polygon, deposit and withdraw. `src/index.ts` registers 2 actions and 1 provider. Both writers route through `vaultClient.executeBatch([…])` against the `aave-v3-polygon` pack's allowlisted Pool selectors.

| Action | What it writes |
|---|---|
| `DEPOSIT_TO_AAVE` | One `vaultClient.executeBatch([…])` with the `Pool.supply(asset, amount, onBehalfOf, referralCode)` calldata (selector `0x617ba037`). USDC.e is the only supported asset; vault balance must be ≥ amount. |
| `WITHDRAW_FROM_AAVE` | One `vaultClient.executeBatch([…])` with the `Pool.withdraw(asset, amount, to)` calldata (selector `0x69328dec`). Amount can be `"all"` / `"max"` → maps to `uint256.max`, which Aave interprets as "withdraw full aToken balance". |

Both actions hard-code chain 137 — the only chain currently supported. Vault addr from `TOKAGENT_VAULT_ADDRESS_137`. The pack's pre-seeded approval (USDC.e → Pool, max) means deposits do not need a separate `approveToken()` call. Provider `aavePositionsProvider` reads the vault's aToken balance for context.

---

## 7. End-to-end Workflows

These are the canonical action sequences the LLM should emit. Parameters are positional names, not literal JSON.

### 7a. New user, no vault → DEPLOY → BUILD → START

Initial state: `vault-context` shows `Vaults: none deployed yet`. Strategies: 0.

1. **Recommend** `GET_TOKAGENT_STATUS` if the user opens vague.
2. **Propose** deploy in turn 1 (no `actions:[]`), wait for confirm.
3. **Confirm turn:** emit `DEPLOY_TOKAGENT_VAULT { chain, packs?, operator? }` — defaults will pick hyperevm + perps pack if user said "deploy a vault" with no detail. After return, runtime setting `TOKAGENT_VAULT_ADDRESS_<chainId>` is set.
4. **Verify** the next turn's `vault-context` reflects the new vault. If yes, propose `BUILD_STRATEGY`.
5. **Build:** `BUILD_STRATEGY { description, chain? }`. Vault resolves to the per-chain setting.
6. **Start:** `START_STRATEGY { id: <built-id>, mode: 'testing' }` (default), or `mode: 'active'` if user explicitly asks for live. Status flips draft → testing/active; the `StrategyRunnerService` tick loop picks it up at the next interval.

State transitions: settings `TOKAGENT_VAULT_ADDRESS_<chainId>` set on step 3; persistence file gets a new Strategy row on step 5; row's `status` flips on step 6.

### 7b. Existing vault, deploy "failed" but contract is on-chain → register

Symptom: a previous `DEPLOY_TOKAGENT_VAULT` returned `vault_deploy_failed` (event decode error pre-alpha.263, RPC stripped logs, etc.) but the user can see the contract on the explorer. The user gives the agent the address.

1. **Verify** the user's address looks valid (`0x` + 40 hex). If not, refuse and ask to re-paste.
2. **Emit** `REGISTER_EXISTING_VAULT { chain, vaultAddress }` (alpha.263; see §3.3 TBD).
3. The action calls `factory.isDeployedVault(vaultAddress)` to confirm provenance, then `persistVaultAddress(runtime, chainId, vaultAddress)` to set both the in-memory setting and the `.env` mirror.
4. **Verify** `vault-context` next turn lists the chain with the new address.
5. **Resume** with `BUILD_STRATEGY` / `LIST_STRATEGIES` etc.

The LLM must NEVER silently retry `DEPLOY_TOKAGENT_VAULT` with a hallucinated address to "fix" the symptom — that creates a duplicate vault and burns gas. If the user has not provided an address, ask for it.

### 7c. Adding a new strategy to an existing vault

Initial state: `vault-context` shows ≥1 vault on the relevant chain. `strategiesByStatus` has some prior strategies.

1. **Optional** `LIST_STRATEGIES` if user references existing strategies by name.
2. **Build** new: `BUILD_STRATEGY { description, chain }`. Vault resolves to existing setting; the LLM picks the kind.
3. **Optional backtest:** `BACKTEST_STRATEGY { id: <new>, days: 30 }` if the kind supports it and the user wants validation before going live.
4. **Start:** `START_STRATEGY { id: <new>, mode: 'testing' }` then `mode: 'active'` after a few ticks.

No on-chain side effects until the runner service ticks an `active` strategy and a kind impl emits a transaction.

### 7d. Stopping all strategies

1. `LIST_STRATEGIES` (no params) → enumerate ids of `active` and `testing` rows.
2. For each id: `STOP_STRATEGY { id }`. Status flips to `stopped`. The runner skips them on subsequent ticks.

Stopped strategies retain `tickHistory` and `backtestResults` for forensics. They cannot be restarted — the user must `BUILD_STRATEGY` a new one (a future `RESUME_STRATEGY` action would change this; not on disk today).

---

## 8. Common failure modes & recovery

| Symptom | Cause | Fix |
|---|---|---|
| Action returns `private_key_missing` / "TOKAGENT_PRIVATE_KEY is not set" but the user has `EVM_PRIVATE_KEY` in `.env`. | Pre-alpha.262 bug — wallet UI read `EVM_PRIVATE_KEY` directly but tokagent actions only checked `TOKAGENT_PRIVATE_KEY`. | Already fixed in alpha.262: `resolveAgentPrivateKey` now falls back through `TOKAGENT_PRIVATE_KEY` → `process.env.TOKAGENT_PRIVATE_KEY` → `process.env.EVM_PRIVATE_KEY`. If still seen, verify the user is on alpha.262+ and the env var is exported (not `export KEY=`-style — `upsertEnvLine` does not parse that form). |
| `vault_deploy_failed` with body "TokagentVaultDeployed event not found in transaction receipt and predicted vault X is not registered in factory. Receipt logs: …" | Alpha.262 ABI was wrong (3-param event). Tx mined, contract deployed, but our parser returned 0 logs. | Already fixed in alpha.263: ABI matches the canonical 5-param event + `isDeployedVault(predicted)` fallback. If it ever recurs (RPC strips logs, downstream ABI drift, indexed-flag mismatch), the recovery is `REGISTER_EXISTING_VAULT { chain, vaultAddress: <predicted-from-error> }` — paste the address from the error message. |
| `BUILD_STRATEGY` returns `no_vault_for_chain` even though the user has a vault. | Vault was deployed via a different process (script, prior session before .env mirror, fresh restart). The runtime setting is empty. | Run `DEPLOY_TOKAGENT_VAULT` if the user genuinely has no vault, or `REGISTER_EXISTING_VAULT` if they do. Never paste the address into `BUILD_STRATEGY`'s `vaultAddress` param without verifying — that bypasses the registration step and the next turn will lose the address again. |
| LLM hallucinated a vault address (`0x123…`, `0xabc…`). | The LLM has no `vault-context` reference (provider failed) or the user did not provide one. | The action validators (`build-strategy.ts:233-239`) catch shape failures and `tokagentActionError`. The LLM must NOT silently retry — refuse, ask the user. The `vault-context` block exists precisely to prevent this hallucination, so a hallucination event implies the provider is broken; check `vaultContext.get` return for thrown exceptions. |
| Perp action returns "CallNotAllowlisted". | Vault was deployed without the `hyperliquid-perps-hyperevm` pack. | Either redeploy the vault with the pack (lose existing balance), or use `vault.setAllowlist(target, selector, true)` directly via the EVM plugin — the strategy plugin does not yet expose a `MUTATE_ALLOWLIST` action. |
| `OPEN_PERP_POSITION` fails with helper-deploy instruction text. | `TOKAGENT_HYPERLIQUID_HELPER_ADDRESS` not set or set to `0x0…0`. | Operator must deploy `TokagentHyperEvmHelper` (one-time, `forge script DeployTokagentHyperEvmHelper.s.sol …`) and set the address in agent config. Same address can be reused by all vaults — helper is stateless. |
| Strategy `[testing]` ticks but never executes. | That's correct — testing mode evaluates but does not send transactions. | `START_STRATEGY { id, mode: 'active' }` to go live. |

---

## 9. Adding a new action (recipe)

For an action `FOO_BAR` in `plugin-tokagent-X`:

1. **Create** `plugins/plugin-tokagent-X/src/actions/foo-bar.ts`. Export `export const fooBarAction: Action = { name: 'FOO_BAR', description, similes, parameters, validate, handler, examples }`. Use the existing actions in the same plugin as templates — copy the IAgentRuntime → AgentRuntimeLike adapter pattern verbatim (`build-strategy.ts:140-148`).
2. **Wire validation** with `tokagentActionError` for input issues, `tokagentActionFailure` for chain/system issues. Never throw out of `handler` — wrap in `try/catch` and convert to `ActionResult`.
3. **If on-chain:** `getPublicClient` + `getWalletClient` + `resolveAgentPrivateKey` + `TokagentVaultClient.executeBatch([call])`. The `call.target/selector` must already be allowlisted via a pack — if not, add a new pack first (§2.6).
4. **Register** in the plugin's `src/index.ts`: import the export, append to the `actions: [...]` array. For tokagentos's order convention, discovery actions come first, then deploy/build, then mutators, then queries.
5. **Add capability hint** in the plugin's `description: '…'` field if the action introduces a new product surface. The LLM uses this as a top-level routing hint.
6. **Update** `GET_TOKAGENT_STATUS.availableActions` in `actions/get-tokagent-status.ts:118-131` so the discovery dump includes the new name.
7. **Tests:** add `src/__tests__/foo-bar.test.ts`. Use `vi.mock` to stub `viem` + `@tokagent/plugin-tokagent-shared` clients. Run via `bunx vitest run` — see §10.
8. **Sync templates:** the plugin tree exists in 3 mirrors; see §10.

---

## 10. Operations

### 10.1 File mirroring

The plugin source lives in three places in this repo. **Canonical edits go in `plugins/`**; the other two are *generated mirrors* and must never be edited by hand:

- Canonical: `tokagentos/plugins/plugin-tokagent-*` — what you import in dev, tests, and local templates.
- Mirror 1: `tokagentos/packages/templates/fullstack-app/plugins/plugin-tokagent-*` — used by the local fullstack-app template.
- Mirror 2: `tokagentos/packages/tokagentos/templates/fullstack-app/plugins/plugin-tokagent-*` — what ships in the published `tokagentos` CLI tarball.

The sync script at `tokagentos/packages/tokagentos/scripts/sync-tokagent-plugins.mjs` copies canonical → both mirrors and rewrites `@tokagentos/core` → `@elizaos/core` in `.ts`/`.json` files (mirrors target upstream eliza scope; canonical develops against the local one). Sync is idempotent and supports `--check` for CI drift detection. Always:

```
# from tokagentos/ root
bun run sync:plugins   # via packages/tokagentos workspace; copies + rewrites
bun run build          # rebuilds dist/ for the canonical packages
```

`prepublishOnly` in `packages/tokagentos/package.json:41` runs both automatically.

### 10.2 Test commands

Use **`bunx vitest run`** for plugin tests. `bun test` does NOT honor `vi.mock`, so module-level mocks (which every TokagentFactoryClient/wallet test relies on) silently leak real network calls. Run from each plugin's package root:

```
cd plugins/plugin-tokagent-shared && bunx vitest run
cd plugins/plugin-tokagent-strategy && bunx vitest run
# ...etc
```

Workspace-wide: `bunx turbo run test` from `tokagentos/`. CI runs the same.

### 10.3 Ship checklist

For every alpha publish:

1. Edit canonical sources (`tokagentos/plugins/…`) only. Never edit mirrors.
2. `bun run sync:plugins` — propagate to both mirrors with scope rewrite.
3. `bun run build` — rebuild canonical `dist/` (mirrors don't have separate builds; they are consumed as source by the scaffolded app).
4. `bunx vitest run` per plugin (or `bunx turbo run test`) — every test must pass.
5. Bump version in `tokagentos/package.json` (root) — alpha tag (`alpha.263` → `alpha.264`).
6. Commit on `master` with the canonical `fix(tokagentos): vX.Y.Z-alpha.NNN — <one-line>` style; `git log --oneline -5` shows the convention.
7. Push to `origin` (= `tokamak-network/Tokamak-AI-Layer`) per `git_remote_policy.md`. Never push to a personal fork.
8. From `packages/tokagentos`: `npm publish --tag alpha`. The `prepublishOnly` hook re-runs sync+build as a safety net.
9. Tarball verify: `npm pack` in `packages/tokagentos`, untar the `tgz`, confirm `templates/fullstack-app/plugins/plugin-tokagent-*` is present and shows `@elizaos/core` in imports (not `@tokagentos/core`).

If `sync:plugins:check` fails in CI after a commit, someone edited a mirror by hand — re-run `bun run sync:plugins` from canonical and amend.
