// Override CONNECTOR_IDS to include App-local connectors.
// The wildcard re-export above is shadowed by this explicit named export.
import { CONNECTOR_IDS as _upstreamConnectorIds } from "@tokagentos/agent/config";

const TOKAGENT_COMPAT_CONNECTOR_IDS = ["telegramAccount"] as const;
/** App-local connectors not present in upstream @tokagentos/agent. */
export const TOKAGENT_LOCAL_CONNECTOR_IDS = ["wechat"] as const;

export const CONNECTOR_IDS = Array.from(
  new Set([
    ..._upstreamConnectorIds,
    ...TOKAGENT_COMPAT_CONNECTOR_IDS,
    ...TOKAGENT_LOCAL_CONNECTOR_IDS,
  ]),
) as ReadonlyArray<
  | (typeof _upstreamConnectorIds)[number]
  | (typeof TOKAGENT_COMPAT_CONNECTOR_IDS)[number]
  | (typeof TOKAGENT_LOCAL_CONNECTOR_IDS)[number]
>;
