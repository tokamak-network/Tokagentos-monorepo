import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyLocalProviderCapabilitiesForTest } from "../provider-switch-config.js";

const ORIGINAL_ENV = { ...process.env };

describe("applyLocalProviderCapabilities — litellm", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("with LITELLM_BASE_URL in env: writes both LITELLM_* and OPENAI_* and sets default models", async () => {
    process.env.LITELLM_BASE_URL = "https://litellm.example.com";
    const config: Record<string, unknown> = {};
    await applyLocalProviderCapabilitiesForTest(config, {
      backend: "litellm" as "litellm",
      apiKey: "lt-secret",
    });

    const env = (config as { env?: Record<string, string> }).env ?? {};
    expect(env.LITELLM_API_KEY).toBe("lt-secret");
    expect(env.OPENAI_API_KEY).toBe("lt-secret");
    expect(env.OPENAI_BASE_URL).toBe("https://litellm.example.com");
    expect(env.OPENAI_SMALL_MODEL).toBe("gpt-4o-mini");
    expect(env.OPENAI_LARGE_MODEL).toBe("gpt-4o");
  });

  it("without LITELLM_BASE_URL: writes nothing — relies on the route-handler precondition", async () => {
    delete process.env.LITELLM_BASE_URL;
    const config: Record<string, unknown> = {};
    await applyLocalProviderCapabilitiesForTest(config, {
      backend: "litellm" as "litellm",
      apiKey: "lt-secret",
    });
    const env = (config as { env?: Record<string, string> }).env ?? {};
    expect(env.LITELLM_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.OPENAI_BASE_URL).toBeUndefined();
  });
});
