import { describe, expect, it } from "vitest";
import { applyPluginAutoEnable } from "../plugin-auto-enable.js";
import { DEFAULT_ONBOARDING_PROVIDER_OPTIONS } from "../../contracts/onboarding-provider-defaults.js";

describe("applyPluginAutoEnable — LiteLLM", () => {
  it("env LITELLM_API_KEY enables @elizaos/plugin-openai with 'litellm' short id", () => {
    const result = applyPluginAutoEnable({
      config: { plugins: { allow: [], entries: {} } },
      env: { LITELLM_API_KEY: "lt-abc" } as NodeJS.ProcessEnv,
    });
    expect(result.config.plugins?.allow).toContain("@elizaos/plugin-openai");
    expect(result.config.plugins?.allow).toContain("litellm");
    expect(result.changes.some((c) => c.includes("env: LITELLM_API_KEY"))).toBe(
      true,
    );
  });

  it("auth profile provider 'litellm' enables @elizaos/plugin-openai with 'litellm' short id", () => {
    const result = applyPluginAutoEnable({
      config: {
        plugins: { allow: [], entries: {} },
        auth: { profiles: { primary: { provider: "litellm" } } },
      },
      env: {} as NodeJS.ProcessEnv,
    });
    expect(result.config.plugins?.allow).toContain("@elizaos/plugin-openai");
    expect(result.config.plugins?.allow).toContain("litellm");
  });

  it("does not allowlist 'openai' short id when only LITELLM_API_KEY is set", () => {
    const result = applyPluginAutoEnable({
      config: { plugins: { allow: [], entries: {} } },
      env: { LITELLM_API_KEY: "lt-abc" } as NodeJS.ProcessEnv,
    });
    expect(result.config.plugins?.allow).not.toContain("openai");
  });
});

describe("DEFAULT_ONBOARDING_PROVIDER_OPTIONS — LiteLLM", () => {
  it("includes a litellm entry pointing at plugin-openai", () => {
    const litellm = DEFAULT_ONBOARDING_PROVIDER_OPTIONS.find(
      (p) => p.id === "litellm",
    );
    expect(litellm).toBeDefined();
    expect(litellm?.pluginName).toBe("@elizaos/plugin-openai");
    expect(litellm?.envKey).toBe("LITELLM_API_KEY");
    expect(litellm?.authMode).toBe("api-key");
    expect(litellm?.group).toBe("local");
    expect(litellm?.order).toBe(75);
  });
});
