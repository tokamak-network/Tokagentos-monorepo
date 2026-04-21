import type { Plugin } from "@tokagentos/core";
import { gatePluginSessionForHostedApp } from "@tokagentos/agent/services/app-session-gate";
import { manageTokagentBrowserWorkspaceAction } from "./action";
import { appBrowserWorkspaceProvider } from "./provider";
import { AppBrowserWorkspaceService } from "./service";
import {
  approveTokagentWalletRequestAction,
  rejectTokagentWalletRequestAction,
  signWithTokagentWalletAction,
} from "./wallet-action";

const rawAppBrowserPlugin: Plugin = {
  name: "@tokagentos/app-browser",
  description:
    "Controls Tokagent browser workspace tabs and Steward wallet signing requests across the desktop bridge and web iframe workspace.",
  actions: [
    manageTokagentBrowserWorkspaceAction,
    signWithTokagentWalletAction,
    approveTokagentWalletRequestAction,
    rejectTokagentWalletRequestAction,
  ],
  providers: [appBrowserWorkspaceProvider],
  services: [AppBrowserWorkspaceService],
};

export const appBrowserPlugin: Plugin = gatePluginSessionForHostedApp(
  rawAppBrowserPlugin,
  "@tokagentos/app-browser",
);

export {
  approveTokagentWalletRequestAction,
  AppBrowserWorkspaceService,
  appBrowserWorkspaceProvider,
  manageTokagentBrowserWorkspaceAction,
  rejectTokagentWalletRequestAction,
  signWithTokagentWalletAction,
};

export default appBrowserPlugin;
