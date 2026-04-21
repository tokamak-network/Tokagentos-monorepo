/**
 * Cloud contributor — reports Tokagent Cloud connection status.
 */

import type { IAgentRuntime } from "@tokagentos/core";
import type { AwarenessContributor } from "@tokagentos/shared/contracts";

export const cloudContributor: AwarenessContributor = {
  id: "cloud",
  position: 70,
  cacheTtl: 60_000,
  invalidateOn: ["config-changed"],
  trusted: true,

  async summary(runtime: IAgentRuntime): Promise<string> {
    const tokagentToken = runtime.getSetting?.("TOKAGENT_CLOUD_AUTH_TOKEN");
    const connected = !!tokagentToken;

    return connected ? "Cloud: connected" : "Cloud: disconnected";
  },
};
