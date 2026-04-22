import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { applyTokagentScaffoldPatches } from "../scaffold.js";

function makeTempSubmoduleTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokagent-patch-test-"));
  // Recreate upstream layout enough for the patch target to exist.
  fs.mkdirSync(path.join(root, "packages/agent/src/runtime"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "packages/agent/src/runtime/core-plugins.ts"),
    "// upstream default\nexport const CORE_PLUGINS = [\"@elizaos/plugin-sql\"];\n",
  );
  return root;
}

describe("applyTokagentScaffoldPatches", () => {
  it("overlays core-plugins.ts with Tokagent content", () => {
    const root = makeTempSubmoduleTree();
    const result = applyTokagentScaffoldPatches({ submoduleRoot: root });

    expect(result.missing).toEqual([]);
    expect(result.applied).toContain(
      path.join("packages", "agent", "src", "runtime", "core-plugins.ts"),
    );

    const overlaid = fs.readFileSync(
      path.join(root, "packages/agent/src/runtime/core-plugins.ts"),
      "utf-8",
    );
    expect(overlaid).toContain("@tokagent/plugin-tokagent-yield");
    expect(overlaid).toContain("@tokagent/plugin-tokagent-perps");
    expect(overlaid).toContain("@tokagent/plugin-tokagent-polymarket");
    // Upstream default removed
    expect(overlaid).not.toContain("// upstream default");

    // cleanup
    fs.rmSync(root, { force: true, recursive: true });
  });

  it("reports missing when target parent dir doesn't exist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokagent-empty-"));
    const result = applyTokagentScaffoldPatches({ submoduleRoot: root });
    // No target parent → the patch ends up in missing[].
    expect(result.applied).toEqual([]);
    expect(result.missing.length).toBeGreaterThan(0);

    // cleanup
    fs.rmSync(root, { force: true, recursive: true });
  });

  it("is idempotent — running twice yields identical output", () => {
    const root = makeTempSubmoduleTree();
    applyTokagentScaffoldPatches({ submoduleRoot: root });
    const after1 = fs.readFileSync(
      path.join(root, "packages/agent/src/runtime/core-plugins.ts"),
      "utf-8",
    );
    applyTokagentScaffoldPatches({ submoduleRoot: root });
    const after2 = fs.readFileSync(
      path.join(root, "packages/agent/src/runtime/core-plugins.ts"),
      "utf-8",
    );
    expect(after1).toEqual(after2);

    // cleanup
    fs.rmSync(root, { force: true, recursive: true });
  });

  it("respects dryRun (no writes)", () => {
    const root = makeTempSubmoduleTree();
    const before = fs.readFileSync(
      path.join(root, "packages/agent/src/runtime/core-plugins.ts"),
      "utf-8",
    );
    const result = applyTokagentScaffoldPatches({ submoduleRoot: root, dryRun: true });
    expect(result.applied.length).toBeGreaterThan(0);
    const after = fs.readFileSync(
      path.join(root, "packages/agent/src/runtime/core-plugins.ts"),
      "utf-8",
    );
    expect(after).toEqual(before);

    // cleanup
    fs.rmSync(root, { force: true, recursive: true });
  });
});
