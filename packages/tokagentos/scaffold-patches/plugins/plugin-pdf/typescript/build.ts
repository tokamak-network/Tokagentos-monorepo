#!/usr/bin/env bun

// Tokagent scaffold-patch overlay: upstream eliza's build.ts hardcodes the
// per-plugin `node_modules/.bin/tsc` path, which isn't materialized in bun
// workspaces because typescript is hoisted to the workspace root. Fall back
// to `bunx tsc` (PATH/registry resolution) when the local binary is absent
// so DTS generation still succeeds in scaffolded projects.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const externalDeps = ["@elizaos/core", "pdfjs-dist"];

async function build(): Promise<void> {
  const totalStart = Date.now();
  const rootDir = fileURLToPath(new URL(".", import.meta.url));

  const nodeStart = Date.now();
  console.log("🔨 Building @elizaos/plugin-pdf for Node (ESM)...");

  const nodeResult = await Bun.build({
    entrypoints: ["index.node.ts"],
    outdir: "dist/node",
    target: "node",
    format: "esm",
    sourcemap: "external",
    minify: false,
    external: externalDeps,
  });

  if (!nodeResult.success) {
    console.error("Node ESM build failed:", nodeResult.logs);
    throw new Error("Node ESM build failed");
  }

  console.log(`✅ Node ESM build complete in ${((Date.now() - nodeStart) / 1000).toFixed(2)}s`);

  const browserStart = Date.now();
  console.log("🌐 Building @elizaos/plugin-pdf for Browser...");

  const browserResult = await Bun.build({
    entrypoints: ["index.browser.ts"],
    outdir: "dist/browser",
    target: "browser",
    format: "esm",
    sourcemap: "external",
    minify: true,
    external: externalDeps,
  });

  if (!browserResult.success) {
    console.error("Browser build failed:", browserResult.logs);
    throw new Error("Browser build failed");
  }

  console.log(`✅ Browser build complete in ${((Date.now() - browserStart) / 1000).toFixed(2)}s`);

  const cjsStart = Date.now();
  console.log("🧱 Building @elizaos/plugin-pdf for Node (CJS)...");

  const cjsResult = await Bun.build({
    entrypoints: ["index.node.ts"],
    outdir: "dist/cjs",
    target: "node",
    format: "cjs",
    sourcemap: "external",
    minify: false,
    external: externalDeps,
  });

  if (!cjsResult.success) {
    console.error("Node CJS build failed:", cjsResult.logs);
    throw new Error("Node CJS build failed");
  }

  const { rename, access } = await import("node:fs/promises");
  try {
    await access("dist/cjs/index.node.js");
    await rename("dist/cjs/index.node.js", "dist/cjs/index.node.cjs");
  } catch (e) {
    console.warn("CJS rename step warning:", e);
  }

  console.log(`✅ Node CJS build complete in ${((Date.now() - cjsStart) / 1000).toFixed(2)}s`);

  const dtsStart = Date.now();
  console.log("📝 Generating TypeScript declarations...");

  const { mkdir, writeFile } = await import("node:fs/promises");
  const { $ } = await import("bun");
  const localTscPath = join(
    rootDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc"
  );

  if (existsSync(localTscPath)) {
    await $`${localTscPath} --project tsconfig.build.json`;
  } else {
    // Hoisted workspace install: tsc is at the workspace root, not the
    // plugin's local node_modules. `bunx tsc` resolves it via PATH walking.
    await $`bunx tsc --project tsconfig.build.json`;
  }

  await mkdir("dist/node", { recursive: true });
  await mkdir("dist/browser", { recursive: true });
  await mkdir("dist/cjs", { recursive: true });

  const reexportDeclaration = `export * from '../index';
export { default } from '../index';
`;

  await writeFile("dist/node/index.d.ts", reexportDeclaration);
  await writeFile("dist/browser/index.d.ts", reexportDeclaration);
  await writeFile("dist/cjs/index.d.ts", reexportDeclaration);

  console.log(`✅ Declarations generated in ${((Date.now() - dtsStart) / 1000).toFixed(2)}s`);

  const totalTime = ((Date.now() - totalStart) / 1000).toFixed(2);
  console.log(`🎉 All builds finished in ${totalTime}s`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
