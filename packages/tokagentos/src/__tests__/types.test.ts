import { describe, expect, test } from "vitest";
import type {
  FullstackTemplateValues,
  TemplateDefinition,
  TemplatesManifest,
} from "../types.js";

describe("TemplateDefinition", () => {
  test("describes the fullstack-app template", () => {
    const template: TemplateDefinition = {
      description: "Fullstack workspace",
      id: "fullstack-app",
      kind: "fullstack-app",
      languages: ["typescript"],
      name: "fullstack-app",
      version: 1,
    };

    expect(template.id).toBe("fullstack-app");
    expect(template.languages).toContain("typescript");
  });
});

describe("TemplatesManifest", () => {
  test("supports template collections", () => {
    const manifest: TemplatesManifest = {
      generatedAt: "2026-04-14T00:00:00.000Z",
      repoUrl: "https://github.com/elizaos/eliza",
      templates: [
        {
          description: "Fullstack workspace",
          id: "fullstack-app",
          kind: "fullstack-app",
          languages: ["typescript"],
          name: "fullstack-app",
          version: 1,
        },
      ],
      version: "1.0.0",
    };

    expect(manifest.templates).toHaveLength(1);
    expect(manifest.templates[0]?.id).toBe("fullstack-app");
  });
});

describe("Template value types", () => {
  test("fullstack values capture branded workspace substitutions", () => {
    const values: FullstackTemplateValues = {
      appName: "Foo App",
      appUrl: "https://example.com/foo-app",
      bugReportUrl: "https://github.com/your-org/foo-app/issues/new",
      bundleId: "com.example.fooapp",
      docsUrl: "https://example.com/foo-app/docs",
      fileExtension: ".foo-app.agent",
      hashtag: "#FooApp",
      orgName: "your-org",
      packageScope: "fooapp",
      projectSlug: "foo-app",
      releaseBaseUrl: "https://example.com/foo-app/releases/",
      repoName: "foo-app",
    };

    expect(values.bundleId).toContain("fooapp");
  });
});
