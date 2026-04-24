/**
 * Optional core plugins are listed in OPTIONAL_CORE_PLUGINS and require
 * explicit configuration to load. Built-in capabilities (trust,
 * secrets-manager, plugin-manager) have been moved to core and are no longer
 * in this list.
 */
import { describe, expect, it } from "vitest";
import type { TokagentConfig } from "../config/types.js";
import { CORE_PLUGINS, OPTIONAL_CORE_PLUGINS } from "./core-plugins.js";
import { collectPluginNames } from "./plugin-collector.js";

/** A sample of optional plugins to verify gating behavior. */
const SAMPLE_OPTIONAL = [
  "@elizaos/plugin-pdf",
  "@elizaos/plugin-obsidian",
  "@elizaos/plugin-discord",
] as const;

describe("optional core plugins (require explicit opt-in)", () => {

  it("sample optional plugins are in OPTIONAL_CORE_PLUGINS but not CORE_PLUGINS", () => {
    for (const pkg of SAMPLE_OPTIONAL) {
      expect(OPTIONAL_CORE_PLUGINS).toContain(pkg);
    }
    for (const pkg of SAMPLE_OPTIONAL) {
      expect(CORE_PLUGINS).not.toContain(pkg);
    }
  });

  it("does not load optional plugins with minimal config", () => {
    const names = collectPluginNames({
      cloud: { enabled: false },
      plugins: {},
    } as TokagentConfig);
    for (const pkg of SAMPLE_OPTIONAL) {
      expect(names.has(pkg)).toBe(false);
    }
  });

  it("loads optional plugins when listed in plugins.allow", () => {
    const names = collectPluginNames({
      cloud: { enabled: false },
      plugins: {
        allow: [...SAMPLE_OPTIONAL],
      },
    } as TokagentConfig);
    for (const pkg of SAMPLE_OPTIONAL) {
      expect(names.has(pkg)).toBe(true);
    }
  });

  it("loads optional plugins only when plugins.entries has enabled: true", () => {
    const names = collectPluginNames({
      cloud: { enabled: false },
      plugins: {
        entries: {
          pdf: {},
          obsidian: { enabled: false },
          discord: { enabled: true },
        },
      },
    } as TokagentConfig);
    // Empty entry object should not enable
    expect(names.has("@elizaos/plugin-pdf")).toBe(false);
    // Explicitly disabled
    expect(names.has("@elizaos/plugin-obsidian")).toBe(false);
    // Explicitly enabled
    expect(names.has("@elizaos/plugin-discord")).toBe(true);
  });

  it("respects plugins.entries enabled: false even when in allow list", () => {
    const names = collectPluginNames({
      cloud: { enabled: false },
      plugins: {
        allow: ["@elizaos/plugin-discord"],
        entries: {
          discord: { enabled: false },
        },
      },
    } as TokagentConfig);
    expect(names.has("@elizaos/plugin-discord")).toBe(false);
  });
});
