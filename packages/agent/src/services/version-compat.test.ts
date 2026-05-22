/**
 * Unit tests for hasDirectLlmProvider — the predicate that drives the
 * SPA's billing redirect on initial '/' landing. See `resolveConversation`'s
 * sibling design doc: only direct LLM API key providers count, Ollama and
 * Tokagent Cloud do not.
 */

import { describe, expect, it } from "vitest";
import { hasDirectLlmProvider } from "./version-compat.js";

describe("hasDirectLlmProvider", () => {
  it("returns true for each direct LLM provider on its own", () => {
    expect(hasDirectLlmProvider(["@elizaos/plugin-anthropic"])).toBe(true);
    expect(hasDirectLlmProvider(["@elizaos/plugin-openai"])).toBe(true);
    expect(hasDirectLlmProvider(["@elizaos/plugin-openrouter"])).toBe(true);
    expect(hasDirectLlmProvider(["@elizaos/plugin-google-genai"])).toBe(true);
    expect(hasDirectLlmProvider(["@elizaos/plugin-groq"])).toBe(true);
    expect(hasDirectLlmProvider(["@elizaos/plugin-xai"])).toBe(true);
    expect(hasDirectLlmProvider(["@homunculuslabs/plugin-zai"])).toBe(true);
  });

  it("returns false for Ollama-only (local, keyless — not a direct API key)", () => {
    expect(hasDirectLlmProvider(["@elizaos/plugin-ollama"])).toBe(false);
  });

  it("returns false when only non-provider plugins are loaded", () => {
    expect(
      hasDirectLlmProvider([
        "@elizaos/plugin-sql",
        "@tokagent/plugin-tokagent-billing",
      ]),
    ).toBe(false);
  });

  it("returns false on the empty list", () => {
    expect(hasDirectLlmProvider([])).toBe(false);
  });

  it("returns true when a direct provider is present alongside others", () => {
    expect(
      hasDirectLlmProvider([
        "@elizaos/plugin-ollama",
        "@elizaos/plugin-anthropic",
        "@elizaos/plugin-sql",
      ]),
    ).toBe(true);
  });

  it("ignores unknown plugin names without throwing", () => {
    expect(hasDirectLlmProvider(["totally-made-up-plugin"])).toBe(false);
    expect(
      hasDirectLlmProvider([
        "totally-made-up-plugin",
        "@elizaos/plugin-openai",
      ]),
    ).toBe(true);
  });
});
