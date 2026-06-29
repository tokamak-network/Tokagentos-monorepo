#!/usr/bin/env bun
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
/**
 * Build script for @tokagentos/billing.
 * Produces ESM + .d.ts in dist/.
 *
 * Type declarations are generated with skipLibCheck and treat @tokagentos/core
 * as an external (its types are already provided by the workspace package at
 * runtime — the billing library does not need to re-emit them).
 */
import { $ } from "bun";

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

  // Ship Drizzle migrations alongside the package. The billing plugin's
  // `initBillingPlugin` resolves the migrations folder via
  // `require.resolve('@tokagentos/billing/package.json')` and then walks
  // into `<pkg-root>/drizzle/migrations`. With `publishConfig.directory: "dist"`
  // the published root is `dist/`, so the migrations must live at
  // `dist/drizzle/migrations` to be found in installed packages.
  if (existsSync("drizzle/migrations")) {
    cpSync("drizzle/migrations", "dist/drizzle/migrations", {
      recursive: true,
    });
  }

  // Emit a publish-ready dist/package.json. `publishConfig.directory: "dist"`
  // makes the published root `dist/`, so it needs its own manifest with
  // dist-relative entry points and resolved workspace deps (other dist-published
  // packages get this from scripts/prepare-package-dist.mjs; the esbuild build
  // emits it here). Only the main `.` entry ships — `./chain/addresses` is an
  // internal subpath bundled into index.js.
  const srcPkg = JSON.parse(readFileSync("package.json", "utf-8"));
  const coreVersion = JSON.parse(
    readFileSync("../typescript/package.json", "utf-8"),
  ).version;
  const distPkg: Record<string, unknown> = {
    name: srcPkg.name,
    version: srcPkg.version,
    type: "module",
    main: "./index.js",
    module: "./index.js",
    types: "./index.d.ts",
    exports: {
      ".": { types: "./index.d.ts", import: "./index.js" },
      "./package.json": "./package.json",
    },
    dependencies: srcPkg.dependencies ?? {},
    peerDependencies: { "@tokagentos/core": `^${coreVersion}` },
    publishConfig: { access: "public" },
  };
  if (srcPkg.license) distPkg.license = srcPkg.license;
  writeFileSync("dist/package.json", `${JSON.stringify(distPkg, null, 2)}\n`);

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
