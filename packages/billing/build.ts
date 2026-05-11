#!/usr/bin/env bun
/**
 * Build script for @tokagentos/billing.
 * Produces ESM + .d.ts in dist/.
 *
 * Type declarations are generated with skipLibCheck and treat @tokagentos/core
 * as an external (its types are already provided by the workspace package at
 * runtime — the billing library does not need to re-emit them).
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
    external: ["viem", "@tokagentos/core"],
    sourcemap: "external",
  });

  // Emit .d.ts declarations via tsc
  await $`tsc -p tsconfig.build.json`;

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
