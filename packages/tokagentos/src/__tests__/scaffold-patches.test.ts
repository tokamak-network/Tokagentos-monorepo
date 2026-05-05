import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { applyTokagentScaffoldPatches, UPSTREAM_PRUNE_PATHS, UPSTREAM_SURGICAL_PATCHES } from "../scaffold.js";

function makeTempSubmoduleTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokagent-patch-test-"));
  // Recreate upstream layout enough for all patch targets to exist.
  fs.mkdirSync(path.join(root, "packages/agent/src/runtime"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "packages/agent/src/runtime/core-plugins.ts"),
    "// upstream default\nexport const CORE_PLUGINS = [\"@elizaos/plugin-sql\"];\n",
  );
  fs.mkdirSync(path.join(root, "packages/app-core/src/navigation"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "packages/app-core/src/navigation/index.ts"),
    "// upstream navigation stub\n",
  );
  // native-plugin-entrypoints: upstream bulk-registers 15 Capacitor bridges;
  // the Tokagent overlay replaces it with a no-op (web-only product).
  fs.mkdirSync(path.join(root, "packages/app-core/src/platform"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "packages/app-core/src/platform/native-plugin-entrypoints.ts"),
    "// upstream capacitor bridge registrations\n",
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

  it("overlays navigation/index.ts with Tokagent tab set", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokagent-nav-"));
    fs.mkdirSync(path.join(root, "packages/app-core/src/navigation"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "packages/app-core/src/navigation/index.ts"),
      "// upstream navigation stub\n",
    );

    const result = applyTokagentScaffoldPatches({ submoduleRoot: root });

    expect(result.applied).toContain(
      path.join("packages", "app-core", "src", "navigation", "index.ts"),
    );
    const navSource = fs.readFileSync(
      path.join(root, "packages/app-core/src/navigation/index.ts"),
      "utf-8",
    );
    // Must keep Chat, Automations, Wallet, Settings (Tokagent DeFi tab set)
    expect(navSource).toMatch(/label:\s*"Chat"/);
    expect(navSource).toMatch(/label:\s*"Automations"/);
    expect(navSource).toMatch(/label:\s*"Wallet"/);
    expect(navSource).toMatch(/label:\s*"Settings"/);
    // Must NOT contain the removed tab groups (general-purpose / consumer tabs)
    expect(navSource).not.toMatch(/label:\s*"Apps"/);
    expect(navSource).not.toMatch(/label:\s*"Character"/);
    expect(navSource).not.toMatch(/label:\s*"Browser"/);
    expect(navSource).not.toMatch(/label:\s*"Stream"/);

    // cleanup
    fs.rmSync(root, { force: true, recursive: true });
  });

  it("overlay mirrors LITELLM_* env vars to OPENAI_* with override semantics", () => {
    const root = makeTempSubmoduleTree();
    applyTokagentScaffoldPatches({ submoduleRoot: root });

    const overlaid = fs.readFileSync(
      path.join(root, "packages/agent/src/runtime/core-plugins.ts"),
      "utf-8",
    );

    // The override-mirror helper must be defined.
    expect(overlaid).toMatch(/function mirrorTokagentEnvAliasOverride\b/);

    // All four LITELLM → OPENAI mirror calls are present.
    expect(overlaid).toContain('mirrorTokagentEnvAliasOverride("LITELLM_API_KEY", "OPENAI_API_KEY")');
    expect(overlaid).toContain('mirrorTokagentEnvAliasOverride("LITELLM_BASE_URL", "OPENAI_BASE_URL")');
    expect(overlaid).toContain('mirrorTokagentEnvAliasOverride("LITELLM_SMALL_MODEL", "OPENAI_SMALL_MODEL")');
    expect(overlaid).toContain('mirrorTokagentEnvAliasOverride("LITELLM_LARGE_MODEL", "OPENAI_LARGE_MODEL")');

    // Coupled-validation guard is present (suppress mirror if either of the
    // two required keys is missing while the other is set).
    expect(overlaid).toMatch(/LITELLM_API_KEY.*LITELLM_BASE_URL.*missing/s);

    fs.rmSync(root, { force: true, recursive: true });
  });
});

describe("UPSTREAM_PRUNE_PATHS", () => {
  it("includes all 29 dead elizaos-plugins paths (19 original + 10 added by Fix A)", () => {
    const required = [
      "plugins/plugin-agent-skills",
      "plugins/plugin-anthropic",
      "plugins/plugin-discord",
      "plugins/plugin-evm",
      "plugins/plugin-google-genai",
      "plugins/plugin-groq",
      "plugins/plugin-imessage",
      "plugins/plugin-local-ai",
      "plugins/plugin-local-embedding",
      "plugins/plugin-ollama",
      "plugins/plugin-openai",
      "plugins/plugin-openrouter",
      "plugins/plugin-pdf",
      "plugins/plugin-shopify",
      "plugins/plugin-sql",
      "plugins/plugin-telegram",
      "plugins/plugin-twitter",
      "plugins/plugin-wechat",
      "plugins/plugin-whatsapp",
      // 10 added by Fix A:
      "plugins/plugin-agent-orchestrator",
      "plugins/plugin-cli",
      "plugins/plugin-commands",
      "plugins/plugin-cron",
      "plugins/plugin-edge-tts",
      "plugins/plugin-music-library",
      "plugins/plugin-music-player",
      "plugins/plugin-plugin-manager",
      "plugins/plugin-shell",
      "plugins/plugin-solana",
    ];
    for (const p of required) {
      expect(UPSTREAM_PRUNE_PATHS).toContain(p);
    }
  });
});

describe("UPSTREAM_SURGICAL_PATCHES", () => {
  it("does not target plugins/plugin-openrouter (npm-resolved, not source-mutated)", () => {
    const targets = UPSTREAM_SURGICAL_PATCHES.map((p) => p.path);
    for (const t of targets) {
      expect(t).not.toMatch(/^plugins\/plugin-openrouter\//);
    }
  });
});
