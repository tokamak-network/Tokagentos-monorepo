import { type OverlayApp, registerOverlayApp } from "@tokagentos/app-core";
import { CompanionAppView } from "./CompanionAppView";

export const COMPANION_APP_NAME = "@tokagentos/app-companion";

export const companionApp: OverlayApp = {
  name: COMPANION_APP_NAME,
  displayName: "Milady Companion",
  description: "3D companion with VRM avatar and chat",
  category: "game",
  icon: null,
  Component: CompanionAppView,
};

/** Register the companion app with the overlay app registry. */
export function registerCompanionApp(): void {
  registerOverlayApp(companionApp);
}
