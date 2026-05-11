/**
 * BillingPageView — container for the Billing surface.
 *
 * Houses four sub-views (Credits / Top-up / API Keys / Usage) behind a
 * left-sidebar tab nav.  Loaded lazily from App.tsx so billing code is never
 * bundled when BILLING_ENABLED is false.
 */

import {
  PageLayout,
  Sidebar,
  SidebarContent,
  SidebarItem,
  SidebarItemBody,
  SidebarItemIcon,
  SidebarItemTitle,
  SidebarPanel,
  SidebarScrollRegion,
} from "@tokagentos/ui";
import { CreditCard, Key, ReceiptText, Zap } from "lucide-react";
import { useState } from "react";
import { CreditsView } from "./billing/CreditsView.js";
import { KeysView } from "./billing/KeysView.js";
import { TopupView } from "./billing/TopupView.js";
import { UsageView } from "./billing/UsageView.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BillingSubTab = "credits" | "topup" | "keys" | "usage";

interface NavItem {
  id: BillingSubTab;
  label: string;
  description: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "credits",
    label: "Credits",
    description: "PTON credit balance",
    icon: CreditCard,
  },
  {
    id: "topup",
    label: "Top-up",
    description: "Add credits via EIP-3009",
    icon: Zap,
  },
  {
    id: "keys",
    label: "API Keys",
    description: "Mint and revoke keys",
    icon: Key,
  },
  {
    id: "usage",
    label: "Usage",
    description: "Call history and token stats",
    icon: ReceiptText,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingPageView(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<BillingSubTab>("credits");

  const sidebar = (
    <Sidebar
      contentIdentity="billing"
      collapsible
      collapseButtonAriaLabel="Collapse billing navigation"
      expandButtonAriaLabel="Expand billing navigation"
      header={
        <div className="px-1">
          <div className="text-xs-tight font-semibold uppercase tracking-[0.16em] text-muted/70">
            Billing
          </div>
        </div>
      }
    >
      <SidebarScrollRegion>
        <SidebarPanel>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <SidebarItem
                key={item.id}
                active={active}
                onClick={() => setActiveTab(item.id)}
                aria-current={active ? "page" : undefined}
              >
                <SidebarItemIcon active={active}>
                  <Icon className="h-4 w-4" aria-hidden />
                </SidebarItemIcon>
                <SidebarItemBody>
                  <SidebarItemTitle>{item.label}</SidebarItemTitle>
                  <SidebarContent.ItemDescription>
                    {item.description}
                  </SidebarContent.ItemDescription>
                </SidebarItemBody>
              </SidebarItem>
            );
          })}
        </SidebarPanel>
      </SidebarScrollRegion>
    </Sidebar>
  );

  const content = (() => {
    switch (activeTab) {
      case "credits":
        return <CreditsView />;
      case "topup":
        return <TopupView />;
      case "keys":
        return <KeysView />;
      case "usage":
        return <UsageView />;
    }
  })();

  return (
    <PageLayout sidebar={sidebar}>
      {content}
    </PageLayout>
  );
}
