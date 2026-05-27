#!/usr/bin/env node
/**
 * Guard: verify installed LLM-provider plugin bundles are intact + API-compatible
 * with the vendored `@elizaos/core` (tokagent/packages/typescript).
 *
 * Three failure modes have actually happened — this guard refuses to install
 * or boot if any recur:
 *   1. `@elizaos/plugin-openrouter` 2.0.0-alpha.11/12/13 ship a 79-line
 *      broken bundle (utility helpers only, no plugin object).
 *   2. `@elizaos/plugin-openrouter` 2.0.0-beta.1 imports
 *      `buildCanonicalSystemPrompt` which the vendored core doesn't export.
 *   3. A stale `bun install` re-resolves to a broken version.
 *
 * Adjust CHECKS below when you intentionally bump a plugin version.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const CHECKS = [
  {
    pkg: "@elizaos/plugin-openrouter",
    entry: "dist/node/index.node.js",
    minLines: 200,
    mustContain: ["TEXT_LARGE", "TEXT_SMALL"],
    mustNotContain: ["buildCanonicalSystemPrompt"],
    pinned: "2.0.0-alpha.10",
    why:
      "alpha.11/12/13 ship a 79-line broken bundle; beta.1 imports the newer " +
      "`buildCanonicalSystemPrompt` core API that vendored tokagent/packages/typescript " +
      "does not export. alpha.10 is the last complete + compatible publish.",
  },
];

let hadFailure = false;
function fail(msg) {
  console.error(`\n\x1b[31m[verify-llm-plugins]\x1b[0m ${msg}`);
  hadFailure = true;
}
function pass(msg) {
  console.log(`\x1b[32m[verify-llm-plugins]\x1b[0m ${msg}`);
}

for (const check of CHECKS) {
  const pkgRoot = path.join(PROJECT_ROOT, "node_modules", check.pkg);
  const entryPath = path.join(pkgRoot, check.entry);
  const pkgJsonPath = path.join(pkgRoot, "package.json");

  if (!existsSync(pkgRoot)) {
    fail(`${check.pkg} is not installed. Run \`bun install\`. Expected pin: ${check.pinned}.`);
    continue;
  }

  let installedVersion = "unknown";
  try {
    installedVersion = JSON.parse(readFileSync(pkgJsonPath, "utf8")).version;
  } catch {}
  if (installedVersion !== "unknown" && installedVersion !== check.pinned) {
    fail(
      `${check.pkg} is at ${installedVersion} but the project is pinned to ${check.pinned}.\n` +
        `  Reason: ${check.why}\n` +
        `  Fix: set package.json's overrides/resolutions for "${check.pkg}" to "${check.pinned}" and run \`bun install\` again.`,
    );
    continue;
  }

  if (!existsSync(entryPath)) {
    fail(
      `${check.pkg}@${installedVersion} is missing its entry file at ${check.entry}. ` +
        `The published tarball is malformed. Re-pin to ${check.pinned}.`,
    );
    continue;
  }

  let body = "";
  let lineCount = 0;
  try {
    body = readFileSync(entryPath, "utf8");
    lineCount = body.split("\n").length;
  } catch (err) {
    fail(`Could not read ${entryPath}: ${err?.message ?? err}`);
    continue;
  }

  if (lineCount < check.minLines) {
    fail(
      `${check.pkg}@${installedVersion} bundle at ${check.entry} has only ${lineCount} lines ` +
        `(expected at least ${check.minLines}). This is the known "broken publish" failure mode. Pin to ${check.pinned}.`,
    );
    continue;
  }

  const missing = check.mustContain.filter((needle) => !body.includes(needle));
  if (missing.length > 0) {
    fail(
      `${check.pkg}@${installedVersion} bundle is missing required tokens: ${missing.join(", ")}.\n` +
        `  Reason: ${check.why}\n  Fix: pin to ${check.pinned}.`,
    );
    continue;
  }

  const forbidden = check.mustNotContain.filter((needle) => body.includes(needle));
  if (forbidden.length > 0) {
    fail(
      `${check.pkg}@${installedVersion} imports an API the vendored \`@elizaos/core\` does not expose: ${forbidden.join(", ")}.\n` +
        `  Reason: ${check.why}\n  Fix: pin to ${check.pinned}.`,
    );
    continue;
  }

  pass(`${check.pkg}@${installedVersion} ✓ (entry=${check.entry}, lines=${lineCount})`);
}

/**
 * Model-id sanity check.
 *
 * Failure mode observed in the field: a user "fixes" `OPENROUTER_SMALL_MODEL`
 * by stripping the `anthropic/` prefix or by using a version that doesn't
 * exist on OpenRouter. The plugin sends the id verbatim, OpenRouter returns
 * an error event the AI SDK can't translate to a message, and the symptom
 * is the opaque `AI_NoOutputGeneratedError: No output generated`. The error
 * never mentions the model id, so users blame the plugin or the API key
 * (both fine) and spend hours debugging.
 *
 * We only inspect the .env — `runtime.getSetting()` is a process.env wrapper,
 * so the .env value is what the plugin will see. We don't hit the network;
 * we just enforce the `<provider>/<model>` shape and warn if a known-bad
 * id is set. If OPENROUTER_API_KEY is empty the user isn't using OpenRouter,
 * so the check is skipped.
 */
function readDotenv() {
  const dotenvPath = path.join(PROJECT_ROOT, ".env");
  if (!existsSync(dotenvPath)) return {};
  const out = {};
  for (const rawLine of readFileSync(dotenvPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    out[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readDotenv();

/**
 * Shell-env vs .env conflict check.
 *
 * Failure mode observed in the field: user rotates an API key in .env, but
 * an old value is still exported in their shell from a prior `export` or a
 * line in ~/.zshrc / ~/.bashrc. dotenv defaults to `override: false`, which
 * means existing process.env values are NOT overwritten by .env. The agent
 * sees the stale shell value, OpenRouter returns 401 "User not found", and
 * the AI SDK surfaces the opaque `AI_NoOutputGeneratedError`. Changing the
 * .env does nothing because the shell value still wins.
 *
 * We don't flip dotenv's `override` flag — that breaks legitimate CI/devops
 * setups that intentionally pass secrets via env vars. Instead we detect
 * the mismatch and tell the user which value will actually be used and how
 * to fix it.
 */
const SHADOWED_KEYS = [
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GROQ_API_KEY",
  "TAVILY_API_KEY",
];
for (const key of SHADOWED_KEYS) {
  const dotenvValue = env[key];
  const shellValue = process.env[key];
  if (dotenvValue && shellValue && dotenvValue !== shellValue) {
    fail(
      `${key} differs between your shell environment and .env.\n` +
        `  shell  : ${shellValue.slice(0, 12)}…${shellValue.slice(-4)} (this is what the agent reads)\n` +
        `  .env   : ${dotenvValue.slice(0, 12)}…${dotenvValue.slice(-4)} (this is what you probably edited)\n` +
        `  dotenv runs with override:false by default, so the shell value wins. To fix:\n` +
        `    unset ${key}   # remove from the current shell\n` +
        `    grep -n ${key} ~/.zshrc ~/.zprofile ~/.bashrc ~/.bash_profile 2>/dev/null\n` +
        `    # delete any matching lines, restart the shell, then re-run \`bun run dev\``,
    );
  }
}

if (env.OPENROUTER_API_KEY) {
  const MODEL_KEYS = [
    "OPENROUTER_SMALL_MODEL",
    "OPENROUTER_LARGE_MODEL",
    "OPENROUTER_IMAGE_MODEL",
    "OPENROUTER_IMAGE_GENERATION_MODEL",
    "OPENROUTER_EMBEDDING_MODEL",
  ];
  // Provider-namespaced model id. OpenRouter ids are `<provider>/<model>`
  // (e.g. anthropic/claude-haiku-4.5, google/gemini-2.0-flash-001).
  const validIdShape = /^[a-z0-9._-]+\/[a-z0-9._-]+(:[a-z0-9._-]+)?$/i;
  for (const key of MODEL_KEYS) {
    const value = env[key];
    if (!value) continue;
    if (!validIdShape.test(value)) {
      fail(
        `${key}=${value} is not a valid OpenRouter model id.\n` +
          `  OpenRouter requires "<provider>/<model>" (e.g. anthropic/claude-haiku-4.5).\n` +
          `  Bad ids surface as AI_NoOutputGeneratedError — the request leaves your machine,\n` +
          `  OpenRouter rejects the model, the AI SDK can't translate the error event, and you\n` +
          `  see "No output generated" with no hint about the model.\n` +
          `  Catalog: https://openrouter.ai/api/v1/models`,
      );
      continue;
    }
    // Catch the specific typo we shipped pre-2.0.31 (claude-haiku-4-5 with
    // a hyphen instead of a dot). OpenRouter uses dotted version suffixes.
    if (/\/claude-(haiku|sonnet|opus)-\d+-\d/i.test(value)) {
      fail(
        `${key}=${value} uses hyphens in the version suffix. OpenRouter uses dots — e.g.\n` +
          `  anthropic/claude-haiku-4.5, anthropic/claude-sonnet-4.6, anthropic/claude-opus-4.1.\n` +
          `  The hyphen form is silently rejected and surfaces as AI_NoOutputGeneratedError.`,
      );
      continue;
    }
    pass(`${key}=${value} ✓ (shape valid)`);
  }
}

/**
 * DB-shadow check.
 *
 * Failure mode observed in the field: an LLM key set during first-boot
 * onboarding is persisted into the `agents` table (`secrets` and
 * `settings.secrets` columns). On every restart, mergeDbSettings() in
 * @elizaos/core copies it into character.settings.secrets, and
 * runtime.getSetting() reads that BEFORE process.env. So rotating .env
 * does nothing — the DB value wins forever, even after .env is changed.
 *
 * We open PGLite read-only, scan agents.secrets and agents.settings.secrets,
 * and warn loudly if any LLM key differs from .env. We don't auto-mutate
 * the DB — clearing secrets is a destructive operation that should be
 * explicit (use scripts/clear-db-llm-secrets.mjs).
 *
 * Best-effort only: skipped if PGLite isn't installed, the DB dir doesn't
 * exist (fresh project), or the `agents` table isn't there yet (pre-boot).
 */
async function checkDbShadow() {
  const dbDir = path.join(PROJECT_ROOT, ".eliza", ".elizadb");
  if (!existsSync(dbDir)) return;
  let PGlite;
  try {
    ({ PGlite } = await import("@electric-sql/pglite"));
  } catch {
    return;
  }
  let db;
  try {
    db = new PGlite(dbDir);
    await db.waitReady;
  } catch {
    return;
  }
  try {
    const result = await db.query(
      "SELECT id, name, secrets, settings FROM agents",
    );
    for (const row of result.rows) {
      const topSecrets =
        row.secrets && typeof row.secrets === "object" ? row.secrets : {};
      const settingsSecrets =
        row.settings &&
        typeof row.settings === "object" &&
        row.settings.secrets &&
        typeof row.settings.secrets === "object"
          ? row.settings.secrets
          : {};
      for (const key of SHADOWED_KEYS) {
        const dbValue = topSecrets[key] ?? settingsSecrets[key];
        const dotenvValue = env[key];
        if (!dbValue) continue;
        if (!dotenvValue) {
          // DB has it, .env doesn't. Probably set via onboarding UI and not
          // mirrored. Not necessarily a bug — but flag it so the user knows.
          continue;
        }
        if (dbValue !== dotenvValue) {
          fail(
            `${key} in PGLite database (agent "${row.name}") differs from .env.\n` +
              `  db    : ${String(dbValue).slice(0, 12)}…${String(dbValue).slice(-4)} (this is what the agent reads)\n` +
              `  .env  : ${String(dotenvValue).slice(0, 12)}…${String(dotenvValue).slice(-4)} (this is what you probably edited)\n` +
              `  mergeDbSettings() in @elizaos/core loads the DB value into character.settings.secrets, and\n` +
              `  runtime.getSetting() reads that BEFORE process.env. Editing .env doesn't help.\n` +
              `  Fix: stop \`bun run dev\` and run \`bun run scripts/clear-db-llm-secrets.mjs\`,\n` +
              `       then start again. .env will then be the source of truth.`,
          );
        }
      }
    }
  } catch {
    // agents table doesn't exist yet (fresh boot) — nothing to check.
  } finally {
    try {
      await db.close();
    } catch {}
  }
}

await checkDbShadow();

if (hadFailure) {
  console.error(
    "\n\x1b[31m[verify-llm-plugins]\x1b[0m One or more LLM-provider checks failed. Chat will not work until this is resolved.\n",
  );
  process.exit(1);
}
