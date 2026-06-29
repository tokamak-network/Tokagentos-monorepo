import type { Tab } from "../navigation";
import type { OnboardingMode, ShellView } from "./types";
import type { UiShellMode } from "./ui-preferences";

export function deriveUiShellModeForTab(_tab: Tab): UiShellMode {
  return "native";
}

export function getTabForShellView(_view: ShellView, _lastNativeTab: Tab): Tab {
  return "operator";
}

export function shouldStartAtCharacterSelectOnLaunch(_params: {
  onboardingNeedsOptions: boolean;
  onboardingMode: OnboardingMode;
  navPath: string;
  urlTab: Tab | null;
}): boolean {
  return false;
}
