import { defineConfig } from "tsup";
import path from "path";

// Monorepo paths
const monorepoRoot = path.resolve(__dirname, "../../..");
const packagesDir = path.join(monorepoRoot, "packages");
const pluginsDir = path.join(monorepoRoot, "plugins");

// Helper to resolve @tokagentos packages from monorepo
function resolvePackage(pkg: string, browserPath?: string): string {
  const pkgName = pkg.replace("@tokagentos/", "");
  
  // Check if it's a core package or a plugin
  let basePath: string;
  if (pkgName === "core") {
    // Core package is at packages/typescript
    basePath = path.join(packagesDir, "typescript");
  } else {
    // Plugins have a typescript/ subdirectory
    basePath = path.join(pluginsDir, pkgName, "typescript");
  }
  
  return browserPath ? path.join(basePath, browserPath) : basePath;
}

// Node.js packages that should not be bundled for browser
const nodeExternals = [
  "@vercel/oidc",
  "sharp",
  "fs",
  "path",
  "crypto",
  "http",
  "https",
  "net",
  "tls",
  "stream",
  "zlib",
  "os",
  "child_process",
  "worker_threads",
  "async_hooks",
  "node:*",
];

export default defineConfig([
  // Background script
  {
    entry: { background: "src/background.ts" },
    outDir: "dist",
    format: ["iife"],
    target: "chrome120",
    platform: "browser",
    splitting: false,
    sourcemap: true,
    clean: false,
    noExternal: [/.*/], // Bundle everything
    globalName: "TokagentOSBackground",
    esbuildOptions(options) {
      options.define = {
        "process.env.NODE_ENV": '"production"',
      };
      options.alias = {
        "@tokagentos/core": resolvePackage("@tokagentos/core"),
        "@tokagentos/plugin-openai": resolvePackage("@tokagentos/plugin-openai"),
        "@tokagentos/plugin-anthropic": resolvePackage("@tokagentos/plugin-anthropic"),
        "@tokagentos/plugin-groq": resolvePackage("@tokagentos/plugin-groq"),
        "@tokagentos/plugin-google-genai": resolvePackage("@tokagentos/plugin-google-genai"),
        "@tokagentos/plugin-eliza-classic": resolvePackage("@tokagentos/plugin-eliza-classic"),
        "@tokagentos/plugin-localdb": resolvePackage("@tokagentos/plugin-localdb"),
      };
    },
  },
  // Offscreen document script (keeps runtime alive when popup closes)
  {
    entry: { offscreen: "src/offscreen.ts" },
    outDir: "dist",
    format: ["esm"],
    target: "chrome120",
    platform: "browser",
    splitting: false,
    sourcemap: true,
    clean: false,
    noExternal: [/.*/],
    banner: {
      js: `// Browser shims
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { env: { NODE_ENV: 'production' }, cwd: () => '/', versions: {}, browser: true };
}
console.log("[TokagentOS] Offscreen bundle starting...");`,
    },
    esbuildOptions(options) {
      options.define = {
        "process.env.NODE_ENV": '"production"',
        "process.env.DOTENV_KEY": '""',
        "process.env.DOTENV_CONFIG_DEBUG": '""',
        "process.env.DOTENV_CONFIG_QUIET": '""',
        "process.env.NODE_DEBUG": '""',
        global: "globalThis",
      };
      options.alias = {
        "@tokagentos/core": resolvePackage("@tokagentos/core", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-openai": resolvePackage("@tokagentos/plugin-openai", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-anthropic": resolvePackage("@tokagentos/plugin-anthropic", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-groq": resolvePackage("@tokagentos/plugin-groq", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-google-genai": resolvePackage("@tokagentos/plugin-google-genai", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-eliza-classic": resolvePackage("@tokagentos/plugin-eliza-classic", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-localdb": resolvePackage("@tokagentos/plugin-localdb", "dist/browser/index.browser.js"),
        "@vercel/oidc": path.join(__dirname, "src/stubs/empty.js"),
        dotenv: path.join(__dirname, "src/stubs/empty.js"),
        "fast-redact": path.join(__dirname, "src/stubs/fast-redact.js"),
      };
    },
  },
  // Content script - IIFE outputs as content.global.js
  {
    entry: { content: "src/content.ts" },
    outDir: "dist",
    format: ["iife"],
    target: "chrome120",
    platform: "browser",
    splitting: false,
    sourcemap: true,
    clean: false,
    noExternal: [/.*/],
    globalName: "TokagentOSContent",
  },
  // Popup script - full TokagentOS version
  {
    entry: { popup: "src/popup-full.ts" },
    outDir: "dist",
    format: ["esm"],
    target: "chrome120",
    platform: "browser",
    splitting: false,
    sourcemap: true,
    clean: false,
    noExternal: [/.*/],
    banner: {
      js: `// Browser shims
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { env: { NODE_ENV: 'production' }, cwd: () => '/', versions: {}, browser: true };
}
console.log("[TokagentOS] Bundle starting...");`,
    },
    esbuildOptions(options) {
      options.define = {
        "process.env.NODE_ENV": '"production"',
        "process.env.DOTENV_KEY": '""',
        "process.env.DOTENV_CONFIG_DEBUG": '""',
        "process.env.DOTENV_CONFIG_QUIET": '""',
        "process.env.NODE_DEBUG": '""',
        global: "globalThis",
      };
      // Use browser builds of @tokagentos packages
      options.alias = {
        "@tokagentos/core": resolvePackage("@tokagentos/core", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-openai": resolvePackage("@tokagentos/plugin-openai", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-anthropic": resolvePackage("@tokagentos/plugin-anthropic", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-groq": resolvePackage("@tokagentos/plugin-groq", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-google-genai": resolvePackage("@tokagentos/plugin-google-genai", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-eliza-classic": resolvePackage("@tokagentos/plugin-eliza-classic", "dist/browser/index.browser.js"),
        "@tokagentos/plugin-localdb": resolvePackage("@tokagentos/plugin-localdb", "dist/browser/index.browser.js"),
        // Stub Node.js packages
        "@vercel/oidc": path.join(__dirname, "src/stubs/empty.js"),
        "dotenv": path.join(__dirname, "src/stubs/empty.js"),
        "fast-redact": path.join(__dirname, "src/stubs/fast-redact.js"),
      };
    },
  },
]);
