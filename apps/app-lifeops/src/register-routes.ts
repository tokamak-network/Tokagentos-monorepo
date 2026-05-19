import { registerAppRoutePluginLoader } from "@tokagentos/app-core/runtime/app-route-plugin-registry";

registerAppRoutePluginLoader("@tokagentos/app-lifeops", async () => {
  const { lifeopsPlugin } = await import("./routes/plugin");
  return lifeopsPlugin;
});
