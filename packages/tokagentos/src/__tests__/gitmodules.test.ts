import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("tokagentos/.gitmodules", () => {
  it("contains no entries pointing at the depopulated elizaos-plugins org", () => {
    // Path resolves from the test file location to the repo root
    // (packages/tokagentos/src/__tests__/ → ../../.. → tokagentos/).
    const repoRoot = path.resolve(__dirname, "../../../..");
    const gitmodulesPath = path.join(repoRoot, ".gitmodules");
    if (!fs.existsSync(gitmodulesPath)) {
      // No .gitmodules at all is also fine (e.g., fresh worktrees, CI
      // sparse checkouts). The assertion only fires if the file exists.
      return;
    }
    const content = fs.readFileSync(gitmodulesPath, "utf-8");
    expect(content).not.toMatch(/elizaos-plugins\//i);
  });

  it("contains no URLs for the 19 known-dead plugin repos by name", () => {
    const repoRoot = path.resolve(__dirname, "../../../..");
    const gitmodulesPath = path.join(repoRoot, ".gitmodules");
    if (!fs.existsSync(gitmodulesPath)) return;
    const content = fs.readFileSync(gitmodulesPath, "utf-8");
    const deadPaths = [
      "plugin-agent-skills",
      "plugin-anthropic",
      "plugin-discord",
      "plugin-evm",
      "plugin-google-genai",
      "plugin-groq",
      "plugin-imessage",
      "plugin-local-ai",
      "plugin-local-embedding",
      "plugin-ollama",
      "plugin-openai",
      "plugin-openrouter",
      "plugin-pdf",
      "plugin-shopify",
      "plugin-sql",
      "plugin-telegram",
      "plugin-twitter",
      "plugin-wechat",
      "plugin-whatsapp",
    ];
    for (const dead of deadPaths) {
      // Match `[submodule "plugins/plugin-X"]` exactly so we don't false-
      // positive on a hypothetical future plugin-X-foo.
      expect(content).not.toMatch(
        new RegExp(`\\[submodule "plugins/${dead}"\\]`, "i"),
      );
    }
  });
});
