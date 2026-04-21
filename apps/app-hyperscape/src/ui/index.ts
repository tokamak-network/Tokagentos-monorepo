import { registerOperatorSurface } from "@tokagentos/app-core/components/apps/surfaces/registry";
import { registerDetailExtension } from "@tokagentos/app-core/components/apps/extensions/registry";
import { HyperscapeOperatorSurface } from "./HyperscapeOperatorSurface.js";
import { HyperscapeDetailExtension } from "./HyperscapeDetailExtension.js";

registerOperatorSurface("@tokagentos/app-hyperscape", HyperscapeOperatorSurface);
registerOperatorSurface("@hyperscape/plugin-hyperscape", HyperscapeOperatorSurface);
registerDetailExtension("hyperscape-embedded-agents", HyperscapeDetailExtension);

export { HyperscapeOperatorSurface, HyperscapeDetailExtension };
