import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn((msg: string) => {
    throw new Error(`CLACK_CANCEL: ${msg}`);
  }),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
  isCancel: vi.fn(() => false),
  text: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
  log: { warn: vi.fn() },
}));

vi.mock("../scaffold.js", () => ({
  buildFullstackTemplateValues: (name: string) => ({ projectSlug: name }),
  getFullstackReplacementEntries: () => [],
  hydrateGitSubmoduleWorkspace: vi.fn(),
  initializeGitSubmodule: vi.fn(),
  renderTemplateTree: ({ destinationDir }: { destinationDir: string }) => {
    fs.mkdirSync(destinationDir, { recursive: true });
    return {};
  },
  resolveTemplateSourceDir: () => "/fake/source",
  resolveTemplateUpstream: () => ({
    branch: "main",
    commit: "x",
    path: "x",
    repo: "x",
  }),
}));

vi.mock("../manifest.js", () => ({
  getTemplateById: () => ({
    id: "fullstack-app",
    name: "fullstack-app",
    languages: ["typescript"],
    upstream: undefined,
  }),
  getTemplatesDir: () => "/fake/templates",
}));

import * as clack from "@clack/prompts";
import { create, scaffoldProject } from "../commands/create.js";

function withTempCwd(fn: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokagent-create-test-"));
  const prev = process.cwd();
  process.chdir(dir);
  return Promise.resolve(fn(dir)).finally(() => {
    process.chdir(prev);
    fs.rmSync(dir, { force: true, recursive: true });
  });
}

describe("scaffoldProject — env writing", () => {
  it("writes the provider key and OpenRouter model defaults to .env", () => {
    return withTempCwd((dir) => {
      scaffoldProject({
        cwd: dir,
        projectName: "test-app-or",
        providerId: "anthropic",
        apiKey: "sk-ant-test",
      });
      const content = fs.readFileSync(
        path.join(dir, "test-app-or", ".env"),
        "utf-8",
      );
      expect(content).toMatch(/^ANTHROPIC_API_KEY=sk-ant-test$/m);
      expect(content).toMatch(
        /^OPENROUTER_SMALL_MODEL=anthropic\/claude-haiku-4-5$/m,
      );
      expect(content).toMatch(
        /^OPENROUTER_LARGE_MODEL=anthropic\/claude-sonnet-4\.6$/m,
      );
    });
  });

  it("throws if the target directory already exists", () => {
    return withTempCwd((dir) => {
      fs.mkdirSync(path.join(dir, "dupe-app"));
      expect(() =>
        scaffoldProject({
          cwd: dir,
          projectName: "dupe-app",
          providerId: "anthropic",
          apiKey: "sk-ant-dupe",
        }),
      ).toThrow(/already exists/);
    });
  });

  it("writes LITELLM_* lines when litellm extras are supplied", () => {
    return withTempCwd((dir) => {
      scaffoldProject({
        cwd: dir,
        projectName: "test-app-lite",
        providerId: "litellm",
        apiKey: "lt-key",
        litellm: {
          baseUrl: "https://lite.example.com",
          smallModel: "gpt-4o-mini",
          largeModel: "gpt-4o",
        },
      });
      const content = fs.readFileSync(
        path.join(dir, "test-app-lite", ".env"),
        "utf-8",
      );
      expect(content).toMatch(/^LITELLM_API_KEY=lt-key$/m);
      expect(content).toMatch(
        /^LITELLM_BASE_URL=https:\/\/lite\.example\.com$/m,
      );
      expect(content).toMatch(/^LITELLM_SMALL_MODEL=gpt-4o-mini$/m);
      expect(content).toMatch(/^LITELLM_LARGE_MODEL=gpt-4o$/m);
      expect(content).not.toMatch(/^OPENAI_API_KEY=lt-key$/m);
    });
  });
});

describe("create — two-step interactive flow", () => {
  it("prompts for name then provider+key and scaffolds the project", () => {
    return withTempCwd((dir) => {
      vi.mocked(clack.text).mockResolvedValueOnce("flow-app");
      vi.mocked(clack.select).mockResolvedValueOnce("anthropic");
      vi.mocked(clack.password).mockResolvedValueOnce("sk-ant-flow");
      return create().then(() => {
        const content = fs.readFileSync(
          path.join(dir, "flow-app", ".env"),
          "utf-8",
        );
        expect(content).toMatch(/^ANTHROPIC_API_KEY=sk-ant-flow$/m);
      });
    });
  });
});
