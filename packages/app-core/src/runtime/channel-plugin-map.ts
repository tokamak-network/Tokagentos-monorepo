import { CHANNEL_PLUGIN_MAP as upstreamChannelPluginMap } from "@tokagentos/agent/runtime/plugin-collector";

const INTERNAL_CHANNEL_PLUGIN_OVERRIDES = {
  signal: "@tokagentos/plugin-signal",
  whatsapp: "@tokagentos/plugin-whatsapp",
  wechat: "tokagentoswechat",
} as const;

export const CHANNEL_PLUGIN_MAP = {
  ...upstreamChannelPluginMap,
  ...INTERNAL_CHANNEL_PLUGIN_OVERRIDES,
};
