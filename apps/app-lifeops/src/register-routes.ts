import { registerAppRoutePluginLoader } from "@tokagentos/app-core/runtime/app-route-plugin-registry";

registerAppRoutePluginLoader("@elizaos/app-lifeops", async () => {
  const { lifeopsPlugin } = await import("./routes/plugin");
  return lifeopsPlugin;
});
