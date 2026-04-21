import { registerAppRoutePluginLoader } from "@tokagentos/app-core/runtime/app-route-plugin-registry";

registerAppRoutePluginLoader("@elizaos/app-steward", async () => {
  const { stewardPlugin } = await import("./plugin");
  return stewardPlugin;
});
