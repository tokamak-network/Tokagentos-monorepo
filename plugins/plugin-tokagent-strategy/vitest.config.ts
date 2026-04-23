import { defineConfig } from "vitest/config";
import { join } from "node:path";

const CORE_SRC = join(__dirname, "../../packages/typescript/src/index.node.ts");

export default defineConfig({
  resolve: {
    alias: {
      "@tokagentos/core": CORE_SRC,
    },
  },
  test: {
    environment: "node",
  },
});
