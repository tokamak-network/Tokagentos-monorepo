#!/usr/bin/env bun
/**
 * Build script for @tokagent/plugin-tokagent-billing.
 * Produces ESM in dist/.
 *
 * No tsc pass — plugin bundles ESM only. .d.ts emission is deferred to a
 * future tsc step if the plugin is published independently.
 */
import { $ } from "bun";
import { cpSync, existsSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

async function build() {
  if (existsSync("dist")) rmSync("dist", { recursive: true });

  // Bundle ESM via bun (primary output)
  await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "node",
    format: "esm",
    external: ["viem", "@elizaos/core", "@tokagentos/billing"],
    sourcemap: "external",
  });

  // Copy non-bundled static assets (operator dashboard SPA — HTML/CSS/JS)
  // so dashboard-routes.ts can readFileSync them at runtime.
  if (existsSync("src/dashboard")) {
    cpSync("src/dashboard", "dist/dashboard", { recursive: true });
  }

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
