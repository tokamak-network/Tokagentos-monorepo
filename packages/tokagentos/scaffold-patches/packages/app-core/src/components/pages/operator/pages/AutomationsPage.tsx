/**
 * Operator Automations section — embeds the full app AutomationsView.
 *
 * Product direction: the operator's Automations section surfaces the COMPLETE
 * automations experience (triggers CRUD, run-now, per-automation chat, heartbeat
 * editor, workflow builder), not a portable summary list.
 *
 * SCAFFOLD overlay only. This intentionally DIVERGES from the monorepo's portable
 * operator AutomationsPage and crosses the operator portability boundary: it
 * renders the app's `AutomationsView`, which exists in the scaffolded eliza
 * app-core (overlaid at components/pages/AutomationsView.tsx) and pulls in the
 * upstream automation siblings. `AutomationsView` takes no props and renders
 * standalone inside the AppProvider context the operator console already runs in.
 */
import { AutomationsView } from "../../AutomationsView";

export function AutomationsPage() {
  return <AutomationsView />;
}
