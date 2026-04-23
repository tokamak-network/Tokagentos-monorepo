#!/usr/bin/env bun
/**
 * Build script for @tokagent/plugin-tokagent-perps.
 * Produces ESM + .d.ts in dist/.
 */
import { $ } from "bun";
import { existsSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

async function build() {
  if (existsSync("dist")) rmSync("dist", { recursive: true });

  // Emit TypeScript declarations (.d.ts) using tsconfig.build.json (no allowImportingTsExtensions).
  await $`bunx tsc --project tsconfig.build.json --emitDeclarationOnly`.quiet();

  // Bundle ESM via bun
  await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "node",
    format: "esm",
    external: ["viem", "@tokagent/plugin-tokagent-shared", "@elizaos/core"],
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
