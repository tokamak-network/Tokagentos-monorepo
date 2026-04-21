import { registerAppRoutePluginLoader } from "@tokagentos/app-core/runtime/app-route-plugin-registry";

registerAppRoutePluginLoader("@elizaos/app-shopify", async () => {
  const { shopifyPlugin } = await import("./plugin");
  return shopifyPlugin;
});
