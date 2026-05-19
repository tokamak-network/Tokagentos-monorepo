import {
  normalizeOnboardingProviderId,
  resolveDeploymentTargetInConfig,
  resolveLinkedAccountsInConfig,
  resolveServiceRoutingInConfig,
} from "./onboarding.js";

export type TokagentCloudService =
  | "inference"
  | "tts"
  | "media"
  | "embeddings"
  | "rpc";

export type ResolvedTokagentCloudTopology = {
  linked: boolean;
  provider: "tokagentcloud" | null;
  runtime: "cloud" | "local";
  services: Record<TokagentCloudService, boolean>;
  shouldLoadPlugin: boolean;
};

const REDACTED_SECRET = "[REDACTED]";

function asConfigRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function _readConfigString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = source?.[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSecretString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === REDACTED_SECRET) {
    return undefined;
  }
  return trimmed;
}

export function isTokagentCloudLinkedInConfig(
  config: Record<string, unknown> | null | undefined,
): boolean {
  const linkedAccounts = resolveLinkedAccountsInConfig(config);
  const linkedCloudAccount = linkedAccounts?.tokagentcloud;
  if (linkedCloudAccount?.status === "linked") {
    return true;
  }

  const cloud = asConfigRecord(config?.cloud);
  return Boolean(normalizeSecretString(cloud?.apiKey));
}

export function resolveTokagentCloudTopology(
  config: Record<string, unknown> | null | undefined,
): ResolvedTokagentCloudTopology {
  const deploymentTarget = resolveDeploymentTargetInConfig(config);
  const routing = resolveServiceRoutingInConfig(config);
  const provider =
    (normalizeOnboardingProviderId(routing?.llmText?.backend) === "tokagentcloud"
      ? "tokagentcloud"
      : null) ??
    (deploymentTarget.provider === "tokagentcloud" ? "tokagentcloud" : null);
  const runtime = deploymentTarget.runtime === "cloud" ? "cloud" : "local";
  const resolvedServices = {
    inference: Boolean(
      routing?.llmText?.transport === "cloud-proxy" &&
        normalizeOnboardingProviderId(routing.llmText.backend) === "tokagentcloud",
    ),
    tts: Boolean(
      routing?.tts?.transport === "cloud-proxy" &&
        normalizeOnboardingProviderId(routing.tts.backend) === "tokagentcloud",
    ),
    media: Boolean(
      routing?.media?.transport === "cloud-proxy" &&
        normalizeOnboardingProviderId(routing.media.backend) === "tokagentcloud",
    ),
    embeddings: Boolean(
      routing?.embeddings?.transport === "cloud-proxy" &&
        normalizeOnboardingProviderId(routing.embeddings.backend) ===
          "tokagentcloud",
    ),
    rpc: Boolean(
      routing?.rpc?.transport === "cloud-proxy" &&
        normalizeOnboardingProviderId(routing.rpc.backend) === "tokagentcloud",
    ),
  } satisfies Record<TokagentCloudService, boolean>;
  const cloudDeploymentSelected =
    deploymentTarget.runtime === "cloud" &&
    deploymentTarget.provider === "tokagentcloud";

  return {
    linked: isTokagentCloudLinkedInConfig(config),
    provider: provider === "tokagentcloud" ? "tokagentcloud" : null,
    runtime,
    services: resolvedServices,
    shouldLoadPlugin:
      cloudDeploymentSelected || Object.values(resolvedServices).some(Boolean),
  };
}

export function isTokagentCloudServiceSelectedInConfig(
  config: Record<string, unknown> | null | undefined,
  service: TokagentCloudService,
): boolean {
  return resolveTokagentCloudTopology(config).services[service];
}

export function shouldLoadTokagentCloudPluginInConfig(
  config: Record<string, unknown> | null | undefined,
): boolean {
  return resolveTokagentCloudTopology(config).shouldLoadPlugin;
}

// Backward-compat aliases (elizaOS pre-rename symbols)
export const isElizaCloudServiceSelectedInConfig = isTokagentCloudServiceSelectedInConfig;
export const isElizaCloudLinkedInConfig = isTokagentCloudLinkedInConfig;
export const shouldLoadElizaCloudPluginInConfig = shouldLoadTokagentCloudPluginInConfig;
