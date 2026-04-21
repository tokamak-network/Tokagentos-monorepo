import { TokagentClient } from "./client-base";
import type {
  AutomationListResponse,
  AutomationNodeCatalogResponse,
} from "./client-types-config";

declare module "./client-base" {
  interface TokagentClient {
    listAutomations(): Promise<AutomationListResponse>;
    getAutomationNodeCatalog(): Promise<AutomationNodeCatalogResponse>;
  }
}

TokagentClient.prototype.listAutomations = async function (
  this: TokagentClient,
): Promise<AutomationListResponse> {
  return this.fetch<AutomationListResponse>("/api/automations");
};

TokagentClient.prototype.getAutomationNodeCatalog = async function (
  this: TokagentClient,
): Promise<AutomationNodeCatalogResponse> {
  return this.fetch<AutomationNodeCatalogResponse>("/api/automations/nodes");
};
