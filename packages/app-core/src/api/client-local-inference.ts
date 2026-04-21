/**
 * Client-side helpers for the local-inference endpoints. Mirrors the
 * structure used by `client-computeruse.ts`: augments `TokagentClient` via
 * declaration merging so callers get typed methods without reaching into
 * raw `fetch` from UI code.
 */

import type { DeviceBridgeStatus } from "../services/local-inference/device-bridge";
import type { PublicRegistration } from "../services/local-inference/handler-registry";
import type { ProviderStatus } from "../services/local-inference/providers";
import type {
  RoutingPolicy,
  RoutingPreferences,
} from "../services/local-inference/routing-preferences";
import type {
  ActiveModelState,
  AgentModelSlot,
  CatalogModel,
  DownloadJob,
  HardwareProbe,
  InstalledModel,
  ModelAssignments,
  ModelBucket,
  ModelHubSnapshot,
} from "../services/local-inference/types";
import type { VerifyResult } from "../services/local-inference/verify";
import { TokagentClient } from "./client-base";

export type {
  ActiveModelState,
  AgentModelSlot,
  CatalogModel,
  DeviceBridgeStatus,
  DownloadJob,
  HardwareProbe,
  InstalledModel,
  ModelAssignments,
  ModelBucket,
  ModelHubSnapshot,
  ProviderStatus,
  PublicRegistration,
  RoutingPolicy,
  RoutingPreferences,
  VerifyResult,
};

declare module "./client-base" {
  interface TokagentClient {
    getLocalInferenceHub(): Promise<ModelHubSnapshot>;
    getLocalInferenceHardware(): Promise<HardwareProbe>;
    getLocalInferenceCatalog(): Promise<{ models: CatalogModel[] }>;
    getLocalInferenceInstalled(): Promise<{ models: InstalledModel[] }>;
    startLocalInferenceDownload(
      modelIdOrSpec: string | CatalogModel,
    ): Promise<{ job: DownloadJob }>;
    searchHuggingFaceGguf(
      query: string,
      limit?: number,
    ): Promise<{ models: CatalogModel[] }>;
    cancelLocalInferenceDownload(
      modelId: string,
    ): Promise<{ cancelled: boolean }>;
    getLocalInferenceActive(): Promise<ActiveModelState>;
    setLocalInferenceActive(modelId: string): Promise<ActiveModelState>;
    clearLocalInferenceActive(): Promise<ActiveModelState>;
    uninstallLocalInferenceModel(id: string): Promise<{ removed: boolean }>;
    getLocalInferenceDeviceStatus(): Promise<DeviceBridgeStatus>;
    getLocalInferenceAssignments(): Promise<{
      assignments: ModelAssignments;
    }>;
    setLocalInferenceAssignment(
      slot: AgentModelSlot,
      modelId: string | null,
    ): Promise<{ assignments: ModelAssignments }>;
    verifyLocalInferenceModel(id: string): Promise<VerifyResult>;
    getLocalInferenceRouting(): Promise<{
      registrations: PublicRegistration[];
      preferences: RoutingPreferences;
    }>;
    setLocalInferencePreferredProvider(
      slot: AgentModelSlot,
      provider: string | null,
    ): Promise<{ preferences: RoutingPreferences }>;
    setLocalInferencePolicy(
      slot: AgentModelSlot,
      policy: RoutingPolicy | null,
    ): Promise<{ preferences: RoutingPreferences }>;
    getLocalInferenceProviders(): Promise<{ providers: ProviderStatus[] }>;
  }
}

TokagentClient.prototype.getLocalInferenceHub = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/local-inference/hub");
};

TokagentClient.prototype.getLocalInferenceHardware = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/local-inference/hardware");
};

TokagentClient.prototype.getLocalInferenceCatalog = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/local-inference/catalog");
};

TokagentClient.prototype.getLocalInferenceInstalled = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/local-inference/installed");
};

TokagentClient.prototype.startLocalInferenceDownload = async function (
  this: TokagentClient,
  modelIdOrSpec: string | CatalogModel,
) {
  const body =
    typeof modelIdOrSpec === "string"
      ? { modelId: modelIdOrSpec }
      : { spec: modelIdOrSpec };
  return this.fetch("/api/local-inference/downloads", {
    method: "POST",
    body: JSON.stringify(body),
  });
};

TokagentClient.prototype.searchHuggingFaceGguf = async function (
  this: TokagentClient,
  query: string,
  limit?: number,
) {
  const params = new URLSearchParams({ q: query });
  if (limit != null) params.set("limit", String(limit));
  return this.fetch(`/api/local-inference/hf-search?${params.toString()}`);
};

TokagentClient.prototype.cancelLocalInferenceDownload = async function (
  this: TokagentClient,
  modelId: string,
) {
  return this.fetch(
    `/api/local-inference/downloads/${encodeURIComponent(modelId)}`,
    { method: "DELETE" },
  );
};

TokagentClient.prototype.getLocalInferenceActive = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/local-inference/active");
};

TokagentClient.prototype.setLocalInferenceActive = async function (
  this: TokagentClient,
  modelId: string,
) {
  return this.fetch("/api/local-inference/active", {
    method: "POST",
    body: JSON.stringify({ modelId }),
  });
};

TokagentClient.prototype.clearLocalInferenceActive = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/local-inference/active", {
    method: "DELETE",
  });
};

TokagentClient.prototype.uninstallLocalInferenceModel = async function (
  this: TokagentClient,
  id: string,
) {
  return this.fetch(
    `/api/local-inference/installed/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
};

TokagentClient.prototype.getLocalInferenceDeviceStatus = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/local-inference/device");
};

TokagentClient.prototype.getLocalInferenceAssignments = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/local-inference/assignments");
};

TokagentClient.prototype.setLocalInferenceAssignment = async function (
  this: TokagentClient,
  slot: AgentModelSlot,
  modelId: string | null,
) {
  return this.fetch("/api/local-inference/assignments", {
    method: "POST",
    body: JSON.stringify({ slot, modelId }),
  });
};

TokagentClient.prototype.verifyLocalInferenceModel = async function (
  this: TokagentClient,
  id: string,
) {
  return this.fetch(
    `/api/local-inference/installed/${encodeURIComponent(id)}/verify`,
    { method: "POST" },
  );
};

TokagentClient.prototype.getLocalInferenceRouting = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/local-inference/routing");
};

TokagentClient.prototype.setLocalInferencePreferredProvider = async function (
  this: TokagentClient,
  slot: AgentModelSlot,
  provider: string | null,
) {
  return this.fetch("/api/local-inference/routing/preferred", {
    method: "POST",
    body: JSON.stringify({ slot, provider }),
  });
};

TokagentClient.prototype.setLocalInferencePolicy = async function (
  this: TokagentClient,
  slot: AgentModelSlot,
  policy: RoutingPolicy | null,
) {
  return this.fetch("/api/local-inference/routing/policy", {
    method: "POST",
    body: JSON.stringify({ slot, policy }),
  });
};

TokagentClient.prototype.getLocalInferenceProviders = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/local-inference/providers");
};
