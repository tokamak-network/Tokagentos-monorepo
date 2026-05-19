import { registerAppRoutePluginLoader } from "@tokagentos/app-core/runtime/app-route-plugin-registry";

registerAppRoutePluginLoader("@tokagentos/app-vincent", async () => {
  const { vincentPlugin } = await import("./plugin");
  return vincentPlugin;
});
