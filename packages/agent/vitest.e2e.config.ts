import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(packageRoot, "..", "..");
// See `test/vitest/default.config.ts` (via root vitest.config.ts) for the
// monorepo rationale. Prefer the local
// tokagent source; fall back to the committed shim when the checkout is
// disabled (CI published-only mode).
const tokagentCoreRolesSource = path.join(
  repoRoot,
  "tokagent",
  "packages",
  "typescript",
  "src",
  "roles.ts",
);
const tokagentCoreRolesAlias = fs.existsSync(tokagentCoreRolesSource)
  ? tokagentCoreRolesSource
  : path.join(repoRoot, "scripts", "lib", "tokagentos-core-roles-shim.js");

export default defineConfig({
  resolve: {
    alias: {
      "@tokagentos/core/roles": tokagentCoreRolesAlias,
      "@tokagentos/core": path.join(
        packageRoot,
        "..",
        "typescript",
        "dist",
        "node",
        "index.node.js",
      ),

    },
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    maxWorkers: 1,
    sequence: {
      concurrent: false,
      shuffle: false,
    },
    include: ["test/**/*.e2e.test.ts"],
    setupFiles: ["test/setup.ts"],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "test/capacitor-plugins.e2e.test.ts",
      // plugin-installer.ts source doesn't exist in autonomous (tokagent-specific)
      "test/plugin-install.e2e.test.ts",
      // native module deps (tensorflow, sharp, canvas) not installed in autonomous
      "test/native-modules.e2e.test.ts",
    ],
    server: {
      deps: {
        inline: [
          "@tokagentos/core",
          "@elizaos/plugin-openai",
          "@elizaos/plugin-anthropic",
          "@elizaos/plugin-sql",
          "@elizaos/plugin-groq",
          "@elizaos/plugin-google-genai",
          "@elizaos/plugin-xai",
          "@elizaos/plugin-openrouter",
          "zod",
        ],
      },
    },
  },
});
