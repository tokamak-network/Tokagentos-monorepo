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

if (hadFailure) {
  console.error(
    "\n\x1b[31m[verify-llm-plugins]\x1b[0m One or more LLM-provider plugin checks failed. Chat will not work until this is resolved.\n",
  );
  process.exit(1);
}
