#!/usr/bin/env bun
/**
 * Build script for @tokagent/plugin-tokagent-billing (v2.0.0).
 *
 * Produces ESM in dist/. v2.x no longer ships the operator dashboard SPA
 * (that lives at app.tokagent.ai now — see MIGRATION_PLAN.md §3 footnote).
 */
import { $ } from "bun";
import { existsSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

async function build() {
  if (existsSync("dist")) rmSync("dist", { recursive: true });

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
