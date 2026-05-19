import { registerAppRoutePluginLoader } from "@tokagentos/app-core/runtime/app-route-plugin-registry";

registerAppRoutePluginLoader("@tokagentos/app-steward", async () => {
  const { stewardPlugin } = await import("./plugin");
  return stewardPlugin;
});
