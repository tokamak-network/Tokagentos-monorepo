#!/usr/bin/env node
/**
 * Pre-dev step: build upstream plugin `dist/` output for the plugins that
 * the agent runtime imports at load time. Without this, `bun run dev`
 * crashes with "Cannot find module '@elizaos/plugin-*'" because the
 * workspace package.json's `main` points at `dist/index.js` and the
 * TypeScript source hasn't been compiled yet.
 *
 * Idempotent — each plugin is skipped if its `dist/` already exists.
 * Runs plugins sequentially (they're small; parallelism adds flakiness).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

/**
 * Patch known tsconfig mismatches in the upstream submodule. Upstream
 * uses `ignoreDeprecations: "6.0"` in some tsconfigs, which TS 5.9
 * rejects as invalid. We pin TS 5.9 at the scaffold level because plugin
 * tsconfigs use `baseUrl` which TS 6 treats as a hard error. Result:
 * upstream's own config assumes one TS version, plugins assume another.
 * Rewrite the problematic value to "5.0" in-place so both build.
 */
function patchTsconfigIgnoreDeprecations(dir) {
  if (!existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  // Any tsconfig*.json at the package root can carry the 6.0 value —
  // upstream scatters it across tsconfig.json, tsconfig.build.json,
  // tsconfig.declarations.json, tsconfig.lib.json etc.
  for (const name of entries) {
    if (!name.startsWith("tsconfig") || !name.endsWith(".json")) continue;
    const p = join(dir, name);
    try {
      const text = readFileSync(p, "utf8");
      if (!text.includes('"ignoreDeprecations": "6.0"')) continue;
      const fixed = text.replace(
        /"ignoreDeprecations":\s*"6\.0"/g,
        '"ignoreDeprecations": "5.0"',
      );
      if (fixed !== text) {
        writeFileSync(p, fixed);
        console.log(
          `[ensure-plugin-builds] patched ${p}: ignoreDeprecations 6.0 -> 5.0`,
        );
      }
    } catch {}
  }
}

/**
 * Rewrite an upstream package.json's `exports`/`main` from `./src/*.ts`
 * to `./dist/*.js` so Node's ESM loader can resolve it post-build.
 * Upstream package.jsons point at source `.ts` files so in-tree dev via
 * bun works; vite and Node-invoked code need compiled JS instead.
 */
function pointExportsAtDist(dir) {
  const p = join(dir, "package.json");
  if (!existsSync(p)) return;
  try {
    const pkg = JSON.parse(readFileSync(p, "utf8"));
    let changed = false;
    const rewriteStr = (s) => {
      if (typeof s !== "string") return s;
      const m = s.replace(/^\.\/src\//, "./dist/").replace(/\.ts$/, ".js");
      if (m !== s) changed = true;
      return m;
    };
    const rewriteValue = (v) => {
      if (typeof v === "string") return rewriteStr(v);
      if (Array.isArray(v)) return v.map(rewriteValue);
      if (v && typeof v === "object") {
        const next = {};
        for (const [k, val] of Object.entries(v)) next[k] = rewriteValue(val);
        return next;
      }
      return v;
    };
    if (pkg.main) pkg.main = rewriteStr(pkg.main);
    if (pkg.module) pkg.module = rewriteStr(pkg.module);
    if (pkg.types) pkg.types = rewriteStr(pkg.types).replace(/\.js$/, ".d.ts");
    if (pkg.exports) pkg.exports = rewriteValue(pkg.exports);
    if (changed) {
      writeFileSync(p, `${JSON.stringify(pkg, null, 2)}\n`);
      console.log(
        `[ensure-plugin-builds] rewrote ${dir}/package.json exports -> dist/`,
      );
    }
  } catch (err) {
    console.error(
      `[ensure-plugin-builds] failed to rewrite ${dir}/package.json:`,
      err instanceof Error ? err.message : err,
    );
  }
}

const UPSTREAM_ROOT = "tokagent";

/**
 * Core packages that plugins depend on for type declarations. Must be
 * built first so plugin DTS generation can resolve `@elizaos/core` and
 * related type imports. Matches upstream's own `scripts/dev.mjs`.
 */
const CORE_PACKAGES = [
  "packages/typescript", // @elizaos/core
  "packages/shared", // @elizaos/shared — imported by vite.config.ts
];

/**
 * Plugin paths relative to the upstream submodule root (`tokagent/`).
 * This matches what the agent runtime imports statically in eliza.ts.
 */
const PLUGIN_PATHS = [
  "plugins/plugin-agent-skills/typescript",
  "plugins/plugin-agent-orchestrator/typescript",
  "plugins/plugin-anthropic/typescript",
  "plugins/plugin-local-embedding/typescript",
  "plugins/plugin-pdf/typescript",
  "plugins/plugin-sql/typescript",
  // Some plugins live at the plugin-<name>/ root (no /typescript/ subfolder).
  // Upstream apps (e.g. app-lifeops) import subpaths from these.
  "plugins/plugin-telegram",
  "plugins/plugin-edge-tts/typescript",
];

/**
 * Check whether a package appears to have a usable built output.
 * Different plugins emit to different dist/ layouts — tsup bundles to
 * `dist/index.js`, others emit `dist/node/index.js`, `dist/plugin.js`,
 * `dist/esm/index.js`, etc. Treat "dist/ exists and contains any .js"
 * as a good-enough signal.
 */
function hasBuildOutput(dir) {
  const distDir = join(dir, "dist");
  if (!existsSync(distDir)) return false;
  let entries;
  try {
    entries = readdirSync(distDir, { recursive: true });
  } catch {
    return false;
  }
  return entries.some(
    (e) =>
      typeof e === "string" &&
      (e.endsWith(".js") || e.endsWith(".cjs") || e.endsWith(".mjs")),
  );
}

/**
 * Build one package from its own `build` script. Returns {status}:
 *   - "built": command succeeded
 *   - "js-only": command exited non-zero but JS output is on disk (tsc
 *      DTS emit commonly fails due to upstream tsconfig quirks that
 *      don't affect runtime)
 *   - "skipped": dir missing
 *   - "present": already has build output
 * Throws if build failed AND no JS output landed (hard fail).
 */
function buildPackage(rel) {
  const dir = join(UPSTREAM_ROOT, rel);
  if (!existsSync(join(dir, "package.json"))) return "skipped";
  if (hasBuildOutput(dir)) return "present";
  console.log(`[ensure-plugin-builds] building ${rel}...`);
  try {
    execFileSync("bun", ["run", "build"], { cwd: dir, stdio: "inherit" });
    return "built";
  } catch (err) {
    if (hasBuildOutput(dir)) {
      console.warn(
        `[ensure-plugin-builds] ${rel}: build exited non-zero but dist/ has output — continuing (likely a DTS-only failure).`,
      );
      return "js-only";
    }
    console.error(
      `[ensure-plugin-builds] ${rel}: build failed with no JS output.`,
    );
    throw err;
  }
}

const counts = { built: 0, "js-only": 0, skipped: 0, present: 0 };

// Core packages FIRST — plugin DTS generation imports from @elizaos/core
// etc., so those packages need their .d.ts on disk before plugins build.
for (const rel of CORE_PACKAGES) {
  const dir = join(UPSTREAM_ROOT, rel);
  patchTsconfigIgnoreDeprecations(dir);
  try {
    counts[buildPackage(rel)] += 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  // Rewrite exports to point at dist/ so Node ESM / vite resolve compiled
  // JS (package.json ships with src/*.ts for in-tree bun dev).
  pointExportsAtDist(dir);
}

// Now plugins that the runtime statically imports.
for (const rel of PLUGIN_PATHS) {
  try {
    counts[buildPackage(rel)] += 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const summary = Object.entries(counts)
  .filter(([, n]) => n > 0)
  .map(([k, n]) => `${k}=${n}`)
  .join(", ");
console.log(`[ensure-plugin-builds] done — ${summary}`);
