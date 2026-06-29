import type { ReactNode } from "react";

/**
 * Operator-only gateway: the app top header is removed.
 *
 * The scaffolded app is the Operator console only — it has its own chrome
 * (sidebar + page), so the upstream eliza multi-tab top bar is useless here.
 * This overlay replaces that full header with a no-op stub: every upstream
 * `<Header .../>` render site (App.tsx renders one per tab-shell branch) becomes
 * a no-op. The `HeaderProps` shape is preserved verbatim so all call sites —
 * `<Header />`, `<Header pageRightExtras={…} />`, etc. — keep typechecking.
 */
interface HeaderProps {
  mobileCenter?: ReactNode;
  mobileLeft?: ReactNode;
  pageRightExtras?: ReactNode;
  transparent?: boolean;
  hideCloudCredits?: boolean;
  tasksEventsPanelOpen?: boolean;
  onToggleTasksPanel?: () => void;
}

export function Header(_props: HeaderProps = {}): null {
  return null;
}
