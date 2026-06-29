import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  buildFullstackTemplateValues,
  ensurePackageJsonWorkspaces,
  ensureUpstreamCompatibilityFiles,
  getFullstackReplacementEntries,
  applyUpstreamSurgicalPatches,
  pruneUpstreamPackageDependencies,
  pruneUpstreamUnusedPaths,
  removePackageJsonDependencies,
  removePackageJsonWorkspaces,
  renderTemplateTree,
} from "../scaffold.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("template value builders", () => {
  test("builds fullstack branding defaults", () => {
    const values = buildFullstackTemplateValues("cool app");
    expect(values.projectSlug).toBe("cool-app");
    expect(values.appName).toBe("Cool App");
    expect(
      getFullstackReplacementEntries(values).some(
        ([from, to]) =>
          from === "__APP_PACKAGE_NAME__" && to === "cool-app-app",
      ),
    ).toBe(true);
    expect(
      getFullstackReplacementEntries(values).some(
        ([from, to]) =>
          from === "__ELECTROBUN_PACKAGE_NAME__" &&
          to === "cool-app-electrobun",
      ),
    ).toBe(true);
  });
});

describe("managed file upgrades", () => {
  test("renders replacement values into file paths as well as file contents", () => {
    const sourceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-render-src-"),
    );
    const destinationDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-render-dest-"),
    );
    tempDirs.push(sourceDir, destinationDir);

    fs.mkdirSync(path.join(sourceDir, "src", "e2e"), { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "src", "e2e", "__PROJECT_SLUG__.e2e.ts"),
      'export const value = "__PROJECT_SLUG__";\n',
    );

    const values = buildFullstackTemplateValues("cool app");

    const managedFiles = renderTemplateTree({
      destinationDir,
      replacements: getFullstackReplacementEntries(values),
      sourceDir,
    });

    const renderedPath = path.join(
      destinationDir,
      "src",
      "e2e",
      "cool-app.e2e.ts",
    );
    expect(fs.existsSync(renderedPath)).toBe(true);
    expect(fs.readFileSync(renderedPath, "utf8")).toContain("cool-app");
    expect(managedFiles).toHaveProperty("src/e2e/cool-app.e2e.ts");
  });

  test("adds missing workspace entries without duplicating existing ones", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-workspaces-"),
    );
    tempDirs.push(projectRoot);

    const packageJsonPath = path.join(projectRoot, "package.json");
    fs.writeFileSync(
      packageJsonPath,
      `${JSON.stringify(
        {
          name: "fixture",
          private: true,
          workspaces: ["packages/*", "plugins/plugin-sql/typescript"],
        },
        null,
        2,
      )}\n`,
    );

    expect(
      ensurePackageJsonWorkspaces(packageJsonPath, [
        "plugins/plugin-sql/typescript",
      ]),
    ).toBe(true);

    const next = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      workspaces: string[];
    };
    expect(next.workspaces).toEqual([
      "packages/*",
      "plugins/plugin-sql/typescript",
    ]);
  });

  test("removes upstream paths that bring in unused workspace deps", () => {
    const submoduleRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-prune-"),
    );
    tempDirs.push(submoduleRoot);

    const elizacloudPkg = path.join(
      submoduleRoot,
      "plugins",
      "plugin-elizacloud",
      "typescript",
      "package.json",
    );
    fs.mkdirSync(path.dirname(elizacloudPkg), { recursive: true });
    fs.writeFileSync(
      elizacloudPkg,
      JSON.stringify({
        name: "@elizaos/plugin-elizacloud",
        dependencies: { "@elizaos/cloud-sdk": "workspace:*" },
      }),
    );

    const cloudSdkPkg = path.join(
      submoduleRoot,
      "cloud",
      "packages",
      "sdk",
      "package.json",
    );
    fs.mkdirSync(path.dirname(cloudSdkPkg), { recursive: true });
    fs.writeFileSync(cloudSdkPkg, JSON.stringify({ name: "@elizaos/cloud-sdk" }));

    const keepPkg = path.join(
      submoduleRoot,
      "plugins",
      "plugin-sql",
      "typescript",
      "package.json",
    );
    fs.mkdirSync(path.dirname(keepPkg), { recursive: true });
    fs.writeFileSync(keepPkg, JSON.stringify({ name: "@elizaos/plugin-sql" }));

    const removed = pruneUpstreamUnusedPaths(submoduleRoot);

    expect(removed.sort()).toEqual(["cloud", "plugins/plugin-elizacloud"]);
    expect(
      fs.existsSync(path.join(submoduleRoot, "plugins", "plugin-elizacloud")),
    ).toBe(false);
    expect(fs.existsSync(path.join(submoduleRoot, "cloud"))).toBe(false);
    expect(fs.existsSync(keepPkg)).toBe(true);
  });

  test("strips upstream-only workspace entries without touching others", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-strip-workspaces-"),
    );
    tempDirs.push(projectRoot);

    const packageJsonPath = path.join(projectRoot, "package.json");
    fs.writeFileSync(
      packageJsonPath,
      `${JSON.stringify(
        {
          name: "fixture",
          private: true,
          workspaces: [
            "packages/*",
            "cloud/packages/sdk",
            "cloud/packages/services/billing",
            "plugins/plugin-sql/typescript",
          ],
        },
        null,
        2,
      )}\n`,
    );

    const changed = removePackageJsonWorkspaces(packageJsonPath, [
      "cloud/packages/sdk",
      "cloud/packages/services/billing",
    ]);
    expect(changed).toBe(true);

    const next = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      workspaces: string[];
    };
    expect(next.workspaces).toEqual([
      "packages/*",
      "plugins/plugin-sql/typescript",
    ]);

    expect(
      removePackageJsonWorkspaces(packageJsonPath, ["cloud/packages/sdk"]),
    ).toBe(false);
  });

  test("strips named deps from package.json across all dep blocks", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-strip-deps-"),
    );
    tempDirs.push(projectRoot);

    const packageJsonPath = path.join(projectRoot, "package.json");
    fs.writeFileSync(
      packageJsonPath,
      `${JSON.stringify(
        {
          name: "fixture",
          dependencies: {
            "@elizaos/plugin-elizacloud": "workspace:*",
            "@elizaos/plugin-sql": "workspace:*",
          },
          devDependencies: {
            "@elizaos/plugin-elizacloud": "workspace:*",
            typescript: "^5",
          },
          peerDependencies: {
            react: "^19",
          },
        },
        null,
        2,
      )}\n`,
    );

    expect(
      removePackageJsonDependencies(packageJsonPath, [
        "@elizaos/plugin-elizacloud",
      ]),
    ).toBe(true);

    const next = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
    };
    expect(next.dependencies).toEqual({ "@elizaos/plugin-sql": "workspace:*" });
    expect(next.devDependencies).toEqual({ typescript: "^5" });
    expect(next.peerDependencies).toEqual({ react: "^19" });

    expect(
      removePackageJsonDependencies(packageJsonPath, [
        "@elizaos/plugin-elizacloud",
      ]),
    ).toBe(false);
  });

  test("pruneUpstreamPackageDependencies scrubs configured upstream package files", () => {
    const submoduleRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-prune-deps-"),
    );
    tempDirs.push(submoduleRoot);

    const writePkg = (relPath: string, body: object) => {
      const target = path.join(submoduleRoot, relPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`);
    };

    writePkg("packages/typescript/package.json", {
      name: "@elizaos/core",
      devDependencies: {
        "@elizaos/plugin-elizacloud": "workspace:*",
        typescript: "^5",
      },
    });
    writePkg(
      "packages/app-core/deploy/cloud-agent-template/package.json",
      {
        name: "cloud-agent-template",
        dependencies: { "@elizaos/plugin-elizacloud": "workspace:*" },
      },
    );

    const modified = pruneUpstreamPackageDependencies(submoduleRoot);
    expect(modified.sort()).toEqual([
      "packages/app-core/deploy/cloud-agent-template/package.json",
      "packages/typescript/package.json",
    ]);

    const tsCore = JSON.parse(
      fs.readFileSync(
        path.join(submoduleRoot, "packages/typescript/package.json"),
        "utf8",
      ),
    ) as { devDependencies: Record<string, string> };
    expect(tsCore.devDependencies).toEqual({ typescript: "^5" });
  });

  test("applyUpstreamSurgicalPatches replaces a unique find-string and throws on drift", () => {
    const submoduleRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-surgical-"),
    );
    tempDirs.push(submoduleRoot);

    const target = path.join(submoduleRoot, "packages/agent/src/api/foo.ts");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      "function foo() {\n  // BEFORE\n  return 1;\n}\n",
    );

    const patches = [
      {
        path: "packages/agent/src/api/foo.ts",
        description: "swap BEFORE for AFTER",
        find: "  // BEFORE\n  return 1;\n",
        replaceWith: "  // AFTER\n  return 2;\n",
      },
    ];

    expect(applyUpstreamSurgicalPatches(submoduleRoot, patches)).toEqual([
      "packages/agent/src/api/foo.ts",
    ]);
    expect(fs.readFileSync(target, "utf8")).toContain("// AFTER\n  return 2;");
    expect(fs.readFileSync(target, "utf8")).not.toContain("BEFORE");

    // Re-applying the same patch must throw — find-string is no longer present.
    expect(() => applyUpstreamSurgicalPatches(submoduleRoot, patches)).toThrow(
      /find-string not present/,
    );
  });

  test("applyUpstreamSurgicalPatches throws when find matches multiple times", () => {
    const submoduleRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-surgical-multi-"),
    );
    tempDirs.push(submoduleRoot);

    const target = path.join(submoduleRoot, "packages/x.ts");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "DUP\nDUP\n");

    expect(() =>
      applyUpstreamSurgicalPatches(submoduleRoot, [
        {
          path: "packages/x.ts",
          description: "dup test",
          find: "DUP\n",
          replaceWith: "OK\n",
        },
      ]),
    ).toThrow(/matched 2 times/);
  });

  test("materializes required upstream compatibility shims", () => {
    const submoduleRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-upstream-compat-"),
    );
    tempDirs.push(submoduleRoot);

    const siblingPath = path.join(
      submoduleRoot,
      "packages",
      "shared",
      "src",
      "env-utils.impl.ts",
    );
    fs.mkdirSync(path.dirname(siblingPath), { recursive: true });
    fs.writeFileSync(
      siblingPath,
      "export function isTruthyEnvValue() { return true; }\n",
    );

    const created = ensureUpstreamCompatibilityFiles(submoduleRoot);

    expect(created).toEqual([
      "packages/shared/src/env-utils.impl.d.ts",
      "packages/shared/src/env-utils.impl.js",
    ]);
    expect(
      fs.existsSync(
        path.join(submoduleRoot, "packages/shared/src/env-utils.impl.js"),
      ),
    ).toBe(true);
  });

});
