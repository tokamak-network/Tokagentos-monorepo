/**
 * Operator shell — the local tokagentOS console at localhost:2138.
 *
 * Self-contained desktop window: chrome (traffic lights + titlebar), a 248px
 * sidebar, and a scrollable main outlet that switches between the six operator
 * pages. Mounted into app-core's ViewRouter as the `operator` tab; the internal
 * page registry mirrors the prototype's `useState('x402')` switch.
 *
 * The root carries `data-theme="dark"` so the gold-on-jet palette renders
 * regardless of the surrounding app theme — the operator window is inherently
 * dark. All visual styling lives in styles/operator.css, scoped under `.op-root`.
 */
import { type ReactElement, useState } from "react";
import "../../../styles/operator.css";
import { KeyLockup } from "./brand/KeyMark";
import { AutomationsPage } from "./pages/AutomationsPage";
import { ChatPage } from "./pages/ChatPage";
import { PluginsPage } from "./pages/PluginsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WalletPage } from "./pages/WalletPage";
import { X402Page } from "./pages/X402Page";
import { Sidebar } from "./Sidebar";

export type OperatorPage =
  | "chat"
  | "wallet"
  | "x402"
  | "automations"
  | "plugins"
  | "settings";

const PAGES: Record<OperatorPage, () => ReactElement> = {
  chat: ChatPage,
  wallet: WalletPage,
  x402: X402Page,
  automations: AutomationsPage,
  plugins: PluginsPage,
  settings: SettingsPage,
};

export function OperatorShell({
  initialPage = "x402",
}: {
  /** Default landing page — x402 for this demo (production likely defaults to chat). */
  initialPage?: OperatorPage;
}) {
  const [page, setPage] = useState<OperatorPage>(initialPage);
  const Page = PAGES[page];

  return (
    <div className="op-root" data-theme="dark">
      <div className="win">
        <div className="win-titlebar">
          <div className="traffic">
            <span className="r" />
            <span className="y" />
            <span className="g" />
          </div>
          <div className="win-title">
            tokagentOS · operator · <b>localhost:2138</b>
          </div>
        </div>
        <div className="win-body">
          <Sidebar
            page={page}
            setPage={setPage}
            brand={<KeyLockup size={18} />}
          />
          <div className="main">
            <Page />
          </div>
        </div>
      </div>
    </div>
  );
}
