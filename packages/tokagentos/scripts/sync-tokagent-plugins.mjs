#!/usr/bin/env node
/**
 * Sync plugin-tokagent-* source trees from tokagentos/plugins/ → templates/fullstack-app/plugins/.
 * Run before publishing the tokagentos CLI.
 *
 * Usage: node scripts/sync-tokagent-plugins.mjs [--check]
 *
 * Without --check: copies files.
 * With --check: exits 1 if any drift is detected (for CI).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname is .../tokagentos/packages/tokagentos/scripts
// repoRoot is the publisher monorepo root: .../tokagentos
const repoRoot = join(__dirname, "..", "..", "..");

const SOURCE = join(repoRoot, "plugins");
const DEST = join(repoRoot, "packages", "tokagentos", "templates", "fullstack-app", "plugins");

const PLUGINS = [
  "plugin-tokagent-shared",
  "plugin-tokagent-yield",
  "plugin-tokagent-perps",
  "plugin-tokagent-polymarket",
  "plugin-tokagent-strategy",
  "plugin-tokagent-billing",
];

const EXCLUDES = ["node_modules", "dist", ".turbo", "tsconfig.tsbuildinfo"];

// Files whose @tokagentos/core references must be rewritten to @elizaos/core
// when copied into the template. The local monorepo uses @tokagentos/core for
// its typescript package; scaffolded projects pull upstream elizaos/eliza
// where the canonical scope is @elizaos. Plugins develop against the local
// name but must ship with the upstream name. Applied to .ts and package.json
// file contents only.
const RENAME_EXTENSIONS = new Set([".ts", ".json"]);
const SCOPE_FROM = "@tokagentos/core";
const SCOPE_TO = "@elizaos/core";

function applyScopeRename(buf, relPath) {
  const ext = relPath.includes(".") ? "." + relPath.split(".").pop() : "";
  if (!RENAME_EXTENSIONS.has(ext)) return buf;
  const text = buf.toString("utf8");
  if (!text.includes(SCOPE_FROM)) return buf;
  // Replace whole-token `@tokagentos/core` — inside quotes, imports, JSON values.
  // No regex needed since the token is unambiguous.
  const rewritten = text.split(SCOPE_FROM).join(SCOPE_TO);
  return Buffer.from(rewritten, "utf8");
}

const check = process.argv.includes("--check");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDES.includes(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (stat.isFile()) {
      out.push(full);
    }
  }
  return out;
}

let mismatches = 0;

for (const plugin of PLUGINS) {
  const srcRoot = join(SOURCE, plugin);
  const dstRoot = join(DEST, plugin);

  if (!existsSync(srcRoot)) {
    console.error(`sync: source missing: ${srcRoot}`);
    process.exit(1);
  }

  const files = walk(srcRoot);
  for (const srcFile of files) {
    const rel = relative(srcRoot, srcFile);
    const dstFile = join(dstRoot, rel);
    const srcBuf = applyScopeRename(readFileSync(srcFile), rel);
    let drift = false;
    if (!existsSync(dstFile)) {
      drift = true;
    } else {
      const dstBuf = readFileSync(dstFile);
      if (Buffer.compare(srcBuf, dstBuf) !== 0) drift = true;
    }

    if (drift) {
      mismatches += 1;
      if (check) {
        console.error(`drift: ${plugin}/${rel}`);
      } else {
        mkdirSync(dirname(dstFile), { recursive: true });
        writeFileSync(dstFile, srcBuf);
        console.log(`sync: copied ${plugin}/${rel}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Billing library — lives at tokagent/packages/billing/ in scaffolds.
// Synced into scaffold-patches/packages/billing/ so the CLI's
// applyTokagentScaffoldPatches step overlays it onto the upstream submodule
// after hydration. Excludes test fixtures and the __tests__ tree (they pull
// in vitest + pglite which we don't ship to scaffolds).
// ---------------------------------------------------------------------------
const BILLING_LIB_SRC = join(repoRoot, "packages", "billing");
const BILLING_LIB_DST = join(
  repoRoot,
  "packages",
  "tokagentos",
  "scaffold-patches",
  "packages",
  "billing",
);
const BILLING_EXCLUDES = [
  "node_modules",
  "dist",
  ".turbo",
  "tsconfig.tsbuildinfo",
  "__tests__",
  "vitest.config.ts",
];

function walkBilling(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (BILLING_EXCLUDES.includes(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkBilling(full));
    } else if (stat.isFile()) {
      out.push(full);
    }
  }
  return out;
}

if (existsSync(BILLING_LIB_SRC)) {
  const files = walkBilling(BILLING_LIB_SRC);
  for (const srcFile of files) {
    const rel = relative(BILLING_LIB_SRC, srcFile);
    const dstFile = join(BILLING_LIB_DST, rel);
    const srcBuf = applyScopeRename(readFileSync(srcFile), rel);
    let drift = false;
    if (!existsSync(dstFile)) {
      drift = true;
    } else {
      const dstBuf = readFileSync(dstFile);
      if (Buffer.compare(srcBuf, dstBuf) !== 0) drift = true;
    }
    if (drift) {
      mismatches += 1;
      if (check) {
        console.error(`drift: packages/billing/${rel}`);
      } else {
        mkdirSync(dirname(dstFile), { recursive: true });
        writeFileSync(dstFile, srcBuf);
        console.log(`sync: copied packages/billing/${rel}`);
      }
    }
  }
}

if (check && mismatches > 0) {
  console.error(`sync check failed: ${mismatches} file(s) out of sync`);
  process.exit(1);
}

if (!check) {
  console.log(`sync complete: ${mismatches} file(s) updated`);
}
