function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasCompatApiToken(): boolean {
  return (
    hasValue(process.env.TOKAGENT_API_TOKEN) ||
    hasValue(process.env.TOKAGENT_API_TOKEN)
  );
}

/**
 * Platform-managed cloud containers should skip local pairing and onboarding UI.
 *
 * In production we may have either:
 * - a Steward sidecar token (older / sidecar-managed path), or
 * - an inbound API token injected directly into the container.
 */
export function isCloudProvisionedContainer(): boolean {
  const hasCloudFlag = process.env.TOKAGENT_CLOUD_PROVISIONED === "1";

  return (
    hasCloudFlag &&
    (hasValue(process.env.STEWARD_AGENT_TOKEN) || hasCompatApiToken())
  );
}
