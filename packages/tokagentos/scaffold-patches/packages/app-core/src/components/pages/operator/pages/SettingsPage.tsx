/**
 * Operator Settings section — embeds the full app SettingsView.
 *
 * Product direction: the operator's Settings section surfaces the COMPLETE
 * settings experience (identity, LLM providers, channels, …), not the portable
 * .env-mirror stub.
 *
 * SCAFFOLD overlay only. This intentionally DIVERGES from the monorepo's portable
 * operator SettingsPage and crosses the operator portability boundary: it renders
 * the app's `SettingsView`, which exists in the scaffolded eliza app-core
 * (overlaid at components/pages/SettingsView.tsx). `SettingsView` has all-optional
 * props and renders standalone inside the AppProvider context.
 *
 * NOTE: the prior operator quick-setup writer (private key + RPC → /api/config/
 * quick-setup) is not part of this app SettingsView; re-add it as a section here
 * if that specific writer is still needed.
 */
import { SettingsView } from "../../SettingsView";

export function SettingsPage() {
  return <SettingsView />;
}
