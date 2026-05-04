import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn((msg: string) => {
    throw new Error(`CLACK_CANCEL: ${msg}`);
  }),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  })),
  note: vi.fn(),
  isCancel: vi.fn(() => false),
  text: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(() => Promise.resolve(true)),
  select: vi.fn(),
  log: { warn: vi.fn() },
}));

vi.mock("../scaffold.js", () => ({
  buildFullstackTemplateValues: (name: string) => ({ projectSlug: name }),
  buildPluginTemplateValues: () => ({}),
  buildMetadata: () => ({}),
  getTemplateReplacementEntries: () => [],
  hydrateGitSubmoduleWorkspace: vi.fn(),
  initializeGitSubmodule: vi.fn(),
  renderTemplateTree: ({ destinationDir }: { destinationDir: string }) => {
    // Create the destination directory so downstream .env writes can succeed.
    fs.mkdirSync(destinationDir, { recursive: true });
    return {};
  },
  resolveTemplateSourceDir: () => "/fake/source",
  resolveTemplateUpstream: () => ({ branch: "main", commit: "x", path: "x", repo: "x" }),
}));

vi.mock("../manifest.js", () => ({
  getTemplateById: () => ({
    id: "fullstack-app",
    name: "fullstack-app",
    languages: ["typescript"],
    upstream: undefined,
  }),
  getTemplates: () => [],
  getTemplatesDir: () => "/fake/templates",
}));

vi.mock("../package-info.js", () => ({
  getCliVersion: () => "0.0.0-test",
}));

vi.mock("../project-metadata.js", () => ({
  writeProjectMetadata: vi.fn(),
}));

import { create } from "../commands/create.js";

function withTempCwd(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokagent-create-test-"));
  const prev = process.cwd();
  process.chdir(dir);
  return fn(dir).finally(() => {
    process.chdir(prev);
    fs.rmSync(dir, { force: true, recursive: true });
  });
}

describe("create command — litellm", () => {
  it("--yes with all four flags writes LITELLM_* to .env", async () => {
    await withTempCwd(async (dir) => {
      await create("test-app", {
        template: "fullstack-app",
        language: "typescript",
        yes: true,
        llm: "litellm",
        apiKey: "lt-key",
        llmBaseUrl: "https://lite.example.com",
        llmSmallModel: "gpt-4o-mini",
        llmLargeModel: "gpt-4o",
      });
      const envPath = path.join(dir, "test-app", ".env");
      const content = fs.readFileSync(envPath, "utf-8");
      expect(content).toMatch(/^LITELLM_API_KEY=lt-key$/m);
      expect(content).toMatch(/^LITELLM_BASE_URL=https:\/\/lite\.example\.com$/m);
      expect(content).toMatch(/^LITELLM_SMALL_MODEL=gpt-4o-mini$/m);
      expect(content).toMatch(/^LITELLM_LARGE_MODEL=gpt-4o$/m);
      expect(content).not.toMatch(/^OPENAI_API_KEY=lt-key$/m);
    });
  });

  it("--yes with --llm litellm but missing --llm-base-url errors out", async () => {
    await withTempCwd(async () => {
      await expect(
        create("test-app2", {
          template: "fullstack-app",
          language: "typescript",
          yes: true,
          llm: "litellm",
          apiKey: "lt-key",
          // intentionally missing llmBaseUrl + llmSmallModel + llmLargeModel
        }),
      ).rejects.toThrow(/CLACK_CANCEL.*--llm-base-url/);
    });
  });
});
