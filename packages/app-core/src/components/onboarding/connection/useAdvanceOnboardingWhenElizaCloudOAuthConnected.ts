import { useEffect, useRef } from "react";
import type { AppState } from "../../../state/types";

type TokagentCloudTab = AppState["onboardingTokagentCloudTab"];

/**
 * Tokagent Cloud inside the **connection** wizard step (not the short `cloudLogin` track).
 *
 * **WHY auto-advance:** parity with `CloudLoginStep` — once `tokagentCloudConnected` is
 * true and the UI shows connected, a second Confirm was redundant UX.
 *
 * **WHY Login tab only:** on API key tab the user may still be typing; advancing on a
 * stale `tokagentCloudConnected` flag would be wrong.
 *
 * **WHY ref + reset on disconnect:** the same mount can see connect → disconnect →
 * connect again; allow a second advance without relying on remount.
 */
export function useAdvanceOnboardingWhenTokagentCloudOAuthConnected(options: {
  /** When false (e.g. another provider selected), do not advance and reset guard. */
  active: boolean;
  tokagentCloudConnected: boolean;
  tokagentCloudTab: TokagentCloudTab;
  handleOnboardingNext: () => void | Promise<void>;
}): void {
  const { active, tokagentCloudConnected, tokagentCloudTab, handleOnboardingNext } =
    options;
  const advancedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      advancedRef.current = false;
      return;
    }
    if (!tokagentCloudConnected) {
      advancedRef.current = false;
      return;
    }
    if (tokagentCloudTab !== "login" || advancedRef.current) return;
    advancedRef.current = true;
    void handleOnboardingNext();
  }, [active, tokagentCloudConnected, tokagentCloudTab, handleOnboardingNext]);
}
