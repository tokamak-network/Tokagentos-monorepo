import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadTokagentConfigMock } = vi.hoisted(() => ({
  loadTokagentConfigMock: vi.fn(),
}));

vi.mock("@tokagentos/agent/config/config", () => ({
  loadTokagentConfig: loadTokagentConfigMock,
}));

import { resolveLifeOpsIMessageBridgeConfig } from "./service-mixin-imessage.js";

describe("resolveLifeOpsIMessageBridgeConfig", () => {
  beforeEach(() => {
    loadTokagentConfigMock.mockReset();
    loadTokagentConfigMock.mockReturnValue({});
  });

  it("prefers BlueBubbles config from Milady config when present", () => {
    loadTokagentConfigMock.mockReturnValue({
      connectors: {
        bluebubbles: {
          enabled: true,
          serverUrl: "http://127.0.0.1:1234",
          password: "secret",
        },
        imessage: {
          enabled: false,
          cliPath: "/Users/test/.local/bin/imsg",
        },
      },
    });

    expect(resolveLifeOpsIMessageBridgeConfig({})).toEqual({
      preferredBackend: "bluebubbles",
      bluebubblesUrl: "http://127.0.0.1:1234",
      bluebubblesPassword: "secret",
      imsgPath: undefined,
    });
  });

  it("falls back to the configured imsg CLI when BlueBubbles is unavailable", () => {
    loadTokagentConfigMock.mockReturnValue({
      connectors: {
        imessage: {
          enabled: true,
          cliPath: "/Users/test/.local/bin/imsg",
        },
      },
    });

    expect(resolveLifeOpsIMessageBridgeConfig({})).toEqual({
      preferredBackend: "imsg",
      bluebubblesUrl: undefined,
      bluebubblesPassword: undefined,
      imsgPath: "/Users/test/.local/bin/imsg",
    });
  });

  it("honors environment overrides over config values", () => {
    loadTokagentConfigMock.mockReturnValue({
      connectors: {
        bluebubbles: {
          enabled: true,
          serverUrl: "http://127.0.0.1:1234",
          password: "secret",
        },
      },
    });

    expect(
      resolveLifeOpsIMessageBridgeConfig({
        TOKAGENT_IMESSAGE_BACKEND: "bluebubbles",
        BLUEBUBBLES_SERVER_URL: "http://127.0.0.1:2345",
        BLUEBUBBLES_PASSWORD: "override",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      preferredBackend: "bluebubbles",
      bluebubblesUrl: "http://127.0.0.1:2345",
      bluebubblesPassword: "override",
      imsgPath: undefined,
    });
  });
});
