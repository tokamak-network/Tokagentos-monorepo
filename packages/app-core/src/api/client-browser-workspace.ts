import type {
  BrowserWorkspaceSnapshot,
  BrowserWorkspaceTab,
  NavigateBrowserWorkspaceTabRequest,
  OpenBrowserWorkspaceTabRequest,
} from "@tokagentos/agent/services/browser-workspace";
import { TokagentClient } from "./client-base";

declare module "./client-base" {
  interface TokagentClient {
    getBrowserWorkspace(): Promise<BrowserWorkspaceSnapshot>;
    openBrowserWorkspaceTab(request: OpenBrowserWorkspaceTabRequest): Promise<{
      tab: BrowserWorkspaceTab;
    }>;
    navigateBrowserWorkspaceTab(
      id: string,
      url: string,
    ): Promise<{ tab: BrowserWorkspaceTab }>;
    showBrowserWorkspaceTab(id: string): Promise<{ tab: BrowserWorkspaceTab }>;
    hideBrowserWorkspaceTab(id: string): Promise<{ tab: BrowserWorkspaceTab }>;
    closeBrowserWorkspaceTab(id: string): Promise<{ closed: boolean }>;
    snapshotBrowserWorkspaceTab(id: string): Promise<{ data: string }>;
  }
}

TokagentClient.prototype.getBrowserWorkspace = async function (this: TokagentClient) {
  return this.fetch("/api/browser-workspace");
};

TokagentClient.prototype.openBrowserWorkspaceTab = async function (
  this: TokagentClient,
  request,
) {
  return this.fetch("/api/browser-workspace/tabs", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

TokagentClient.prototype.navigateBrowserWorkspaceTab = async function (
  this: TokagentClient,
  id,
  url,
) {
  return this.fetch(
    `/api/browser-workspace/tabs/${encodeURIComponent(id)}/navigate`,
    {
      method: "POST",
      body: JSON.stringify({ url } satisfies Pick<
        NavigateBrowserWorkspaceTabRequest,
        "url"
      >),
    },
  );
};

TokagentClient.prototype.showBrowserWorkspaceTab = async function (
  this: TokagentClient,
  id,
) {
  return this.fetch(
    `/api/browser-workspace/tabs/${encodeURIComponent(id)}/show`,
    {
      method: "POST",
    },
  );
};

TokagentClient.prototype.hideBrowserWorkspaceTab = async function (
  this: TokagentClient,
  id,
) {
  return this.fetch(
    `/api/browser-workspace/tabs/${encodeURIComponent(id)}/hide`,
    {
      method: "POST",
    },
  );
};

TokagentClient.prototype.closeBrowserWorkspaceTab = async function (
  this: TokagentClient,
  id,
) {
  return this.fetch(`/api/browser-workspace/tabs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

TokagentClient.prototype.snapshotBrowserWorkspaceTab = async function (
  this: TokagentClient,
  id,
) {
  return this.fetch(
    `/api/browser-workspace/tabs/${encodeURIComponent(id)}/snapshot`,
  );
};
