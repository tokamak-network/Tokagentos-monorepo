/**
 * Vincent domain methods — OAuth registration, token exchange, status, disconnect.
 */

/** Declaration merging must target the module that declares `TokagentClient` (see `declare module` below). */
import { TokagentClient } from "@tokagentos/app-core/api/client-base";

// ── Types ─────────────────────────────────────────────────────────────

export interface VincentStatusResponse {
  connected: boolean;
  connectedAt: number | null;
}

// ── Declaration merging ───────────────────────────────────────────────

export interface VincentStartLoginResponse {
  authUrl: string;
  state: string;
  redirectUri: string;
}

declare module "@tokagentos/app-core/api/client-base" {
  interface TokagentClient {
    vincentStartLogin(appName?: string): Promise<VincentStartLoginResponse>;
    vincentRegister(
      appName: string,
      redirectUris: string[],
    ): Promise<{ client_id: string }>;
    vincentExchangeToken(
      code: string,
      clientId: string,
      codeVerifier: string,
    ): Promise<{ ok: boolean; connected: boolean }>;
    vincentStatus(): Promise<VincentStatusResponse>;
    vincentDisconnect(): Promise<{ ok: boolean }>;
  }
}

// ── Implementation ────────────────────────────────────────────────────

TokagentClient.prototype.vincentStartLogin = async function (appName?: string) {
  return this.fetch("/api/vincent/start-login", {
    method: "POST",
    body: JSON.stringify({ appName: appName ?? "Tokagent" }),
  });
};

TokagentClient.prototype.vincentRegister = async function (
  appName: string,
  redirectUris: string[],
) {
  return this.fetch("/api/vincent/register", {
    method: "POST",
    body: JSON.stringify({ appName, redirectUris }),
  });
};

TokagentClient.prototype.vincentExchangeToken = async function (
  code: string,
  clientId: string,
  codeVerifier: string,
) {
  return this.fetch("/api/vincent/token", {
    method: "POST",
    body: JSON.stringify({ code, clientId, codeVerifier }),
  });
};

TokagentClient.prototype.vincentStatus = async function () {
  return this.fetch("/api/vincent/status");
};

TokagentClient.prototype.vincentDisconnect = async function () {
  return this.fetch("/api/vincent/disconnect", { method: "POST" });
};
