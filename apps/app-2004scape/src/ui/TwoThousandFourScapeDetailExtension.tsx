import { TwoThousandFourScapeOperatorSurface } from "./TwoThousandFourScapeOperatorSurface";
import type { AppDetailExtensionProps } from "@tokagentos/app-core/components/apps/extensions/types";

export function TwoThousandFourScapeDetailExtension({
  app,
}: AppDetailExtensionProps) {
  return (
    <TwoThousandFourScapeOperatorSurface appName={app.name} variant="detail" />
  );
}
