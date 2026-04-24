/**
 * Utilities for managed Discord connector UI.
 * Extracted from cloud-dashboard-utils during cloud-UI removal.
 */

import type { CloudCompatAgent } from "../../api";
import { pathForTab } from "../../navigation";

const MANAGED_DISCORD_GATEWAY_AGENT_NAME = "Discord Gateway";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isManagedDiscordGatewayAgent(agent: CloudCompatAgent): boolean {
  const config = isRecord(agent.agent_config) ? agent.agent_config : null;
  const gatewayConfig = config
    ? (config.__managedDiscordGateway as Record<string, unknown> | undefined)
    : undefined;
  if (isRecord(gatewayConfig) && gatewayConfig.mode === "shared-gateway") {
    return true;
  }
  return (
    agent.agent_name.trim().toLowerCase() ===
    MANAGED_DISCORD_GATEWAY_AGENT_NAME.toLowerCase()
  );
}

export function buildManagedDiscordSettingsReturnUrl(
  rawUrl: string,
): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const settingsPath = pathForTab("settings");

  if (url.protocol === "file:") {
    url.hash = settingsPath;
    url.search = "";
    return url.toString();
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  const settingsPathname = normalizedPath.replace(/\/[^/]*$/, settingsPath);
  url.pathname = settingsPathname === "" ? settingsPath : settingsPathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function resolveManagedDiscordAgentChoice(agents: CloudCompatAgent[]):
  | {
      mode: "none";
      agent: null;
      selectedAgentId: null;
    }
  | {
      mode: "bootstrap";
      agent: null;
      selectedAgentId: null;
    }
  | {
      mode: "direct";
      agent: CloudCompatAgent;
      selectedAgentId: string;
    }
  | {
      mode: "picker";
      agent: null;
      selectedAgentId: string;
    } {
  const gatewayAgents = agents.filter(isManagedDiscordGatewayAgent);
  if (agents.length === 0) {
    return {
      mode: "none",
      agent: null,
      selectedAgentId: null,
    };
  }

  if (gatewayAgents.length === 0) {
    return {
      mode: "bootstrap",
      agent: null,
      selectedAgentId: null,
    };
  }

  if (gatewayAgents.length === 1) {
    return {
      mode: "direct",
      agent: gatewayAgents[0],
      selectedAgentId: gatewayAgents[0].agent_id,
    };
  }

  return {
    mode: "picker",
    agent: null,
    selectedAgentId: (gatewayAgents[0] ?? agents[0]).agent_id,
  };
}
