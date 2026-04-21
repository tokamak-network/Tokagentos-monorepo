import { registerOperatorSurface } from "@tokagentos/app-core/components/apps/surfaces/registry";
import { registerDetailExtension } from "@tokagentos/app-core/components/apps/extensions/registry";
import { BabylonOperatorSurface } from "./BabylonOperatorSurface.js";
import { BabylonDetailExtension } from "./BabylonDetailExtension.js";

registerOperatorSurface("@tokagentos/app-babylon", BabylonOperatorSurface);
registerDetailExtension("babylon-operator-dashboard", BabylonDetailExtension);

export { BabylonOperatorSurface, BabylonDetailExtension };
