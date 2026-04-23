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
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..", "..");
// Points at /.../tokagentos/ — adjust if this script moves.

const SOURCE = join(repoRoot, "tokagentos", "plugins");
const DEST = join(repoRoot, "tokagentos", "packages", "templates", "fullstack-app", "plugins");

const PLUGINS = [
  "plugin-tokagent-shared",
  "plugin-tokagent-yield",
  "plugin-tokagent-perps",
  "plugin-tokagent-polymarket",
  "plugin-tokagent-strategy",
];

const EXCLUDES = ["node_modules", "dist", ".turbo", "tsconfig.tsbuildinfo"];

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
    let drift = false;
    if (!existsSync(dstFile)) {
      drift = true;
    } else {
      const srcBuf = readFileSync(srcFile);
      const dstBuf = readFileSync(dstFile);
      if (Buffer.compare(srcBuf, dstBuf) !== 0) drift = true;
    }

    if (drift) {
      mismatches += 1;
      if (check) {
        console.error(`drift: ${plugin}/${rel}`);
      } else {
        mkdirSync(dirname(dstFile), { recursive: true });
        execFileSync("cp", [srcFile, dstFile]);
        console.log(`sync: copied ${plugin}/${rel}`);
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
