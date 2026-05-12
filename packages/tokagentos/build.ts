#!/usr/bin/env bun

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const PACKAGE_DIR = import.meta.dir;
const DIST_DIR = path.join(PACKAGE_DIR, "dist");
// Templates are now authored in-place under packages/tokagentos/templates/
// (the same path that gets shipped in the npm tarball). The previous setup
// kept a separate source mirror at packages/templates/ and copied from there,
// but the mirror went stale; the CLI consumed packages/tokagentos/templates/
// directly anyway. Build just regenerates the manifest now.
const TEMPLATE_DIR = path.join(PACKAGE_DIR, "templates");
const MANIFEST_PATH = path.join(PACKAGE_DIR, "templates-manifest.json");
const SKIP_ENTRIES = new Set([
  ".DS_Store",
  ".git",
  ".turbo",
  ".vite",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_ENTRIES.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
      continue;
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }
}

function loadTemplateDefinitions() {
  const templates = [];
  for (const entry of fs.readdirSync(TEMPLATE_DIR, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const metadataPath = path.join(
      TEMPLATE_DIR,
      entry.name,
      "template.json",
    );
    if (!fs.existsSync(metadataPath)) continue;
    templates.push(JSON.parse(fs.readFileSync(metadataPath, "utf-8")));
  }
  templates.sort((a, b) => a.name.localeCompare(b.name));
  return templates;
}

function prepareTemplates(): void {
  // Templates are authored in-place; no copy step needed. Regenerate
  // the manifest only.
  const manifest = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    repoUrl: "https://github.com/elizaos/eliza",
    templates: loadTemplateDefinitions(),
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function buildTypescript(): void {
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
  execSync("bunx --bun tsc -p tsconfig.json", {
    cwd: PACKAGE_DIR,
    stdio: "inherit",
  });
}

function ensureCliShebang(): void {
  const cliPath = path.join(DIST_DIR, "cli.js");
  if (!fs.existsSync(cliPath)) return;
  let content = fs.readFileSync(cliPath, "utf-8");
  if (!content.startsWith("#!")) {
    content = `#!/usr/bin/env node\n${content}`;
    fs.writeFileSync(cliPath, content);
  }
  fs.chmodSync(cliPath, 0o755);
}

prepareTemplates();
buildTypescript();
ensureCliShebang();
