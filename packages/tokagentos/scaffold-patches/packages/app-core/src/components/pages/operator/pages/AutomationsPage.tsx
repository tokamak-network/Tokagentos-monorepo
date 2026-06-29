/**
 * Operator Automations section — embeds the full app automations page.
 *
 * Product direction: the operator's Automations section surfaces the COMPLETE
 * automations experience exactly as the standalone tab did — so it renders
 * `AutomationsDesktopShell` (the workspace chrome + per-automation chat sidebar +
 * AutomationsLayout), which is what the eliza app's `case "automations"` renders.
 *
 * SCAFFOLD overlay only. This intentionally DIVERGES from the monorepo's portable
 * operator AutomationsPage and crosses the operator portability boundary: it
 * renders the eliza app-core's automations page (overlaid at
 * components/pages/AutomationsView.tsx, which exports both AutomationsView and
 * AutomationsDesktopShell). Takes no props; renders standalone inside the
 * AppProvider context the operator console already runs in.
 */
import { AutomationsDesktopShell } from "../../AutomationsView";

export function AutomationsPage() {
  return <AutomationsDesktopShell />;
}
