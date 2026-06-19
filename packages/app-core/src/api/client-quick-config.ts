/**
 * Quick-config domain — paired with the simplified Settings page.
 * Posts a private key + per-chain RPC URLs to the local agent, which
 * persists them via persistConfigEnv() and triggers a restart.
 */

import { TokagentClient } from "./client-base";

export type QuickConfigChain =
  | "ethereum"
  | "polygon"
  | "base"
  | "arbitrum"
  | "optimism"
  | "bsc";

export interface QuickConfigRpcEntry {
  chain: QuickConfigChain;
  url: string;
}

export interface QuickConfigSaveRequest {
  privateKey: string;
  rpcs: QuickConfigRpcEntry[];
}

export interface QuickConfigSaveResponse {
  ok: true;
  written: string[];
  restarting: boolean;
}

declare module "./client-base" {
  interface TokagentClient {
    saveQuickConfig(
      payload: QuickConfigSaveRequest,
    ): Promise<QuickConfigSaveResponse>;
  }
}

TokagentClient.prototype.saveQuickConfig = async function (
  this: TokagentClient,
  payload: QuickConfigSaveRequest,
): Promise<QuickConfigSaveResponse> {
  // Same-origin POST. The wrapper's apiJson prefixes PROXY_BASE for
  // billing-gateway routes; this endpoint MUST hit the local agent so the
  // .env actually gets written (cf. commit 720836be in plugin-tokagent-billing).
  const response = await fetch("/api/config/quick-setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let message = `saveQuickConfig failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body?.error === "string") {
        message = body.error;
      }
    } catch {
      // body wasn't JSON; keep the generic message.
    }
    throw new Error(message);
  }
  return (await response.json()) as QuickConfigSaveResponse;
};
