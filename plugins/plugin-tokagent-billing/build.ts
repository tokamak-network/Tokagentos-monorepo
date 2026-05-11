#!/usr/bin/env bun
/**
 * Build script for @tokagent/plugin-tokagent-billing.
 * Produces ESM + .d.ts in dist/.
 *
 * Type declarations are generated with skipLibCheck and treat @tokagentos/core
 * and @tokagentos/billing as externals (their types are already provided by
 * the workspace packages at runtime — the plugin does not need to re-emit them).
 */
import { $ } from "bun";
import { existsSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

async function build() {
  if (existsSync("dist")) rmSync("dist", { recursive: true });

  // Bundle ESM via bun (primary output)
  await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "node",
    format: "esm",
    external: ["viem", "@tokagentos/core", "@tokagentos/billing"],
    sourcemap: "external",
  });

  console.log("✓ build complete");
}

if (watch) {
  await build();
  const watcher = Bun.watch("./src", { recursive: true });
  for await (const _ of watcher) {
    console.log("[watch] rebuilding...");
    try {
      await build();
    } catch (e) {
      console.error(e);
    }
  }
} else {
  await build();
}
