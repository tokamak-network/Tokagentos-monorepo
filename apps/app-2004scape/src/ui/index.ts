import { registerOperatorSurface } from "@tokagentos/app-core/components/apps/surfaces/registry";
import { registerDetailExtension } from "@tokagentos/app-core/components/apps/extensions/registry";
import { TwoThousandFourScapeOperatorSurface } from "./TwoThousandFourScapeOperatorSurface.js";
import { TwoThousandFourScapeDetailExtension } from "./TwoThousandFourScapeDetailExtension.js";

registerOperatorSurface("@tokagentos/app-2004scape", TwoThousandFourScapeOperatorSurface);
registerDetailExtension("2004scape-operator-dashboard", TwoThousandFourScapeDetailExtension);

export { TwoThousandFourScapeOperatorSurface, TwoThousandFourScapeDetailExtension };
