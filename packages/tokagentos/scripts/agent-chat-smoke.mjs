#!/usr/bin/env node
/**
 * Agent chat smoke benchmark — Phase 6 of the agent-effectiveness plan.
 *
 * Posts a fixed 10-prompt sequence against a running tokagentOS scaffold
 * (default http://127.0.0.1:31337) and asserts pass criteria for each.
 *
 * Two modes:
 *   - default (no LLM):    works with a fake API key. Verifies the chat
 *                          path is clean — no validator-error leaks, no
 *                          canned wallet-status dumps, all 10 prompts
 *                          return valid HTTP responses without crashing.
 *                          This is the CI-runnable contract.
 *
 *   - --require-llm:       requires the agent to be configured with a
 *                          real LLM key. Adds assertions about WHICH
 *                          action the agent picked for each prompt
 *                          (best-effort string match on response). Use
 *                          this to validate real LLM behavior locally
 *                          when iterating on character/examples.
 *
 * Usage:
 *   node scripts/agent-chat-smoke.mjs                  # default
 *   node scripts/agent-chat-smoke.mjs --require-llm    # full asserts
 *   BASE_URL=http://localhost:9999 node ...            # custom server
 *
 * Exit code: 0 if all prompts pass; 1 otherwise.
 *
 * Caller is responsible for spinning up the dev server. Typical flow:
 *   cd <scaffolded-project>
 *   bun run dev &
 *   # wait for "Agent ready"
 *   node <tokagentos-package>/scripts/agent-chat-smoke.mjs
 */

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:31337";
const REQUIRE_LLM = process.argv.includes("--require-llm");
// First turn after agent boot can take 25-30s as eliza warms model handles
// and runs action discovery. 45s default is generous; tighten via env when
// the agent has been hot for a while.
const MAX_TURN_MS = Number(process.env.SMOKE_MAX_TURN_MS || 45_000);

/**
 * The 10-prompt benchmark. `expectAction` is a substring the response
 * SHOULD contain when the LLM is wired up. `forbid` is a list of
 * substrings that must never appear (validator leaks, canned dumps).
 */
const PROMPTS = [
  {
    id: "discovery",
    prompt: "what can you do?",
    expectAction: "GET_TOKAGENT_STATUS",
    description: "Discovery — should hit GET_TOKAGENT_STATUS",
  },
  {
    id: "deploy_no_vault",
    prompt: "deploy a perp strategy",
    expectAction: "DEPLOY_TOKAGENT_VAULT",
    description:
      "User asks for strategy with no vault — agent should propose DEPLOY_TOKAGENT_VAULT first, NOT BUILD_STRATEGY with a placeholder",
  },
  {
    id: "vault_address_query",
    prompt: "what is my vault address?",
    expectAction: null, // either reads from context or says none deployed
    description: "Vault address query — answers from context, no action invocation needed",
  },
  {
    id: "deploy_vault_explicit",
    prompt: "deploy a vault on hyperEVM",
    expectAction: "DEPLOY_TOKAGENT_VAULT",
    description: "Explicit deploy — should call DEPLOY_TOKAGENT_VAULT",
  },
  {
    id: "build_strategy_with_vault",
    prompt:
      "build a yield strategy on USDC for vault 0xAbc1234567890123456789012345678901234567 on polygon",
    expectAction: "BUILD_STRATEGY",
    description: "Concrete build with vault — should call BUILD_STRATEGY",
  },
  {
    id: "anaphora_resolution",
    prompt: "start that strategy",
    expectAction: "START_STRATEGY",
    description: 'Anaphora — "that" should resolve to a strategy and call START_STRATEGY',
  },
  {
    id: "list_strategies",
    prompt: "what strategies are running?",
    expectAction: "LIST_STRATEGIES",
    description: "List query — should call LIST_STRATEGIES",
  },
  {
    id: "stop_all",
    prompt: "stop everything",
    expectAction: "STOP_STRATEGY",
    description: "Stop all — should call STOP_STRATEGY",
  },
  {
    id: "balance_query",
    prompt: "is the vault funded?",
    expectAction: null, // reads balance from runtime context, no action firing
    description: "Balance query — reads wallet/vault balance, may or may not invoke an action",
  },
  {
    id: "off_topic_eliza",
    prompt: "tell me about ELIZA the chatbot",
    expectAction: null,
    description: "Off-topic — agent should redirect or refuse, NOT recite Joseph-Weizenbaum lore",
    forbidExtra: [
      "joseph weizenbaum",
      "mit in the mid-1960s",
      "rogerian psychotherapist",
    ],
  },
];

// ── Forbidden substrings (validator leaks + canned dumps) ────────────────────

const GLOBAL_FORBID = [
  // Phase 1 invariant: validator-error strings must never reach chat.
  "Invalid vaultAddress:",
  "Must be a valid EVM address",
  // Phase 1 (server-helpers surgical-patch): no IDENTITY canned dump
  // for "address" messages.
  "Wallet network: mainnet.\nDetected wallets:",
  // Other validator-shape phrases we've seen leak before:
  /^Invalid [a-zA-Z]+: /, // start-of-message validator
  /^Unsupported chain "/,
  /^Missing required parameters?:/,
];

function checkForbidden(text, extraForbidden = []) {
  const violations = [];
  for (const pattern of [...GLOBAL_FORBID, ...extraForbidden]) {
    if (typeof pattern === "string") {
      if (text.toLowerCase().includes(pattern.toLowerCase())) {
        violations.push(`forbidden substring present: "${pattern}"`);
      }
    } else if (pattern instanceof RegExp) {
      if (pattern.test(text)) {
        violations.push(`forbidden regex matched: ${pattern.source}`);
      }
    }
  }
  return violations;
}

// ── HTTP plumbing ────────────────────────────────────────────────────────────

async function http(method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MAX_TURN_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}

async function ensureReachable() {
  try {
    const r = await http("GET", "/api/conversations");
    if (r.status >= 400) {
      throw new Error(`unexpected status ${r.status}`);
    }
  } catch (err) {
    console.error(
      `[smoke] cannot reach ${BASE_URL}/api/conversations: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    console.error(
      "[smoke] start the dev server first: cd <scaffold> && bun run dev",
    );
    process.exit(2);
  }
}

async function freshConversation() {
  const r = await http("POST", "/api/conversations", {});
  if (r.status >= 400 || !r.json?.conversation?.id) {
    throw new Error(
      `failed to create conversation: status=${r.status} body=${r.text.slice(0, 200)}`,
    );
  }
  return r.json.conversation.id;
}

// ── Per-prompt assertions ────────────────────────────────────────────────────

async function runPrompt(convId, spec, idx) {
  const r = await http("POST", `/api/conversations/${convId}/messages`, {
    text: spec.prompt,
  });

  const errors = [];
  if (r.status !== 200) {
    errors.push(`HTTP ${r.status}`);
  }
  if (!r.json) {
    errors.push("response is not valid JSON");
  }
  const replyText = String(r.json?.text ?? "");

  if (replyText.length === 0) {
    errors.push("response.text is empty");
  } else if (replyText.length > 10_000) {
    errors.push(`response.text is suspiciously long (${replyText.length} chars)`);
  }

  // Phase 1 invariant — these patterns must never appear regardless of LLM.
  errors.push(...checkForbidden(replyText, spec.forbidExtra ?? []));

  // LLM-dependent checks. With a fake key, the agent returns "Sorry, I'm
  // having a provider issue" and we can't assert action selection. Skip
  // those unless --require-llm is set.
  const isProviderIssue = replyText.includes("provider issue");
  if (REQUIRE_LLM && spec.expectAction !== null) {
    if (!replyText.includes(spec.expectAction)) {
      errors.push(
        `expected response to mention action "${spec.expectAction}" — got: ${replyText.slice(0, 120)}`,
      );
    }
  }

  return {
    spec,
    idx,
    status: r.status,
    replyText,
    isProviderIssue,
    errors,
    pass: errors.length === 0,
  };
}

// ── Reporter ────────────────────────────────────────────────────────────────

function pad(s, n) {
  return (String(s) + " ".repeat(n)).slice(0, n);
}

function reportRow(r) {
  const mark = r.pass ? "PASS" : "FAIL";
  const id = pad(r.spec.id, 24);
  const provider = r.isProviderIssue ? " [no-LLM]" : "";
  return `  ${mark}  #${r.idx + 1}  ${id}${provider}`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[smoke] base URL: ${BASE_URL}`);
  console.log(
    `[smoke] mode: ${REQUIRE_LLM ? "REQUIRE-LLM (full asserts)" : "default (no-LLM ok)"}`,
  );
  console.log(`[smoke] running ${PROMPTS.length} prompts ...\n`);

  await ensureReachable();
  const convId = await freshConversation();

  const results = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    const spec = PROMPTS[i];
    process.stdout.write(`  -> #${i + 1} ${spec.id} ... `);
    try {
      const r = await runPrompt(convId, spec, i);
      results.push(r);
      console.log(r.pass ? "ok" : "FAIL");
      if (!r.pass) {
        for (const err of r.errors) {
          console.log(`     - ${err}`);
        }
        console.log(`     reply: ${r.replyText.slice(0, 200)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ spec, idx: i, errors: [msg], pass: false });
      console.log("ERROR");
      console.log(`     - ${msg}`);
    }
  }

  const passes = results.filter((r) => r.pass).length;
  const fails = results.length - passes;

  console.log("\n[smoke] summary:");
  for (const r of results) {
    console.log(reportRow(r));
  }
  console.log(`\n[smoke] ${passes}/${results.length} passed, ${fails} failed`);

  if (REQUIRE_LLM) {
    const noLlmCount = results.filter((r) => r.isProviderIssue).length;
    if (noLlmCount > 0) {
      console.log(
        `[smoke] WARN: --require-llm was set but ${noLlmCount} responses came back as "provider issue" — set a real API key`,
      );
    }
  }

  process.exit(fails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[smoke] crashed:", err);
  process.exit(2);
});
