/**
 * Wallet domain methods — wallet addresses/balances, BSC trading, steward,
 * trading profile, registry (ERC-8004), drop/mint, whitelist, twitter verify.
 */

import type { DropStatus, MintResult } from "@tokagentos/agent/contracts/drop";
import type { VerificationResult } from "@tokagentos/agent/contracts/verification";
import type {
  BrowserWorkspaceSolanaMessageSignatureResult,
  BrowserWorkspaceWalletMessageSignatureResult,
  BrowserWorkspaceWalletTransactionResult,
} from "@elizaos/app-steward/browser-workspace-wallet";
import type {
  BscTradeExecuteRequest,
  BscTradeExecuteResponse,
  BscTradePreflightResponse,
  BscTradeQuoteRequest,
  BscTradeQuoteResponse,
  BscTradeTxStatusResponse,
  BscTransferExecuteRequest,
  BscTransferExecuteResponse,
  StewardApprovalActionResponse,
  StewardBalanceResponse,
  StewardHistoryResponse,
  StewardPendingResponse,
  StewardSignRequest,
  StewardSignResponse,
  StewardStatusResponse,
  StewardTokenBalancesResponse,
  StewardWalletAddressesResponse,
  StewardWebhookEventsResponse,
  StewardWebhookEventType,
} from "@elizaos/app-steward/types";
import type {
  WalletAddresses,
  WalletBalancesResponse,
  WalletConfigStatus,
  WalletConfigUpdateRequest,
  WalletNftsResponse,
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "@tokagentos/shared/contracts";
import { TokagentClient } from "./client-base";
import type {
  ApplyProductionWalletDefaultsResponse,
  RegistrationResult,
  RegistryConfig,
  RegistryStatus,
  VerificationMessageResponse,
  WalletExportResult,
  WhitelistStatus,
} from "./client-types";

// ---------------------------------------------------------------------------
// Declaration merging
// ---------------------------------------------------------------------------

declare module "./client-base" {
  interface TokagentClient {
    getWalletAddresses(): Promise<WalletAddresses>;
    getWalletBalances(): Promise<WalletBalancesResponse>;
    getWalletNfts(): Promise<WalletNftsResponse>;
    getWalletConfig(): Promise<WalletConfigStatus>;
    updateWalletConfig(
      config: WalletConfigUpdateRequest,
    ): Promise<{ ok: boolean }>;
    refreshCloudWallets(): Promise<{
      ok: boolean;
      warnings?: string[];
    }>;
    setWalletPrimary(params: {
      chain: "evm" | "solana";
      source: "local" | "cloud";
    }): Promise<{ ok: boolean }>;
    generateWallet(params?: {
      chain?: "evm" | "solana" | "both";
      source?: "local" | "steward";
    }): Promise<{
      ok: boolean;
      wallets: Array<{ chain: string; address: string }>;
      source?: string;
      warnings?: string[];
    }>;
    exportWalletKeys(exportToken: string): Promise<WalletExportResult>;
    getBscTradePreflight(
      tokenAddress?: string,
    ): Promise<BscTradePreflightResponse>;
    getBscTradeQuote(
      request: BscTradeQuoteRequest,
    ): Promise<BscTradeQuoteResponse>;
    executeBscTrade(
      request: BscTradeExecuteRequest,
    ): Promise<BscTradeExecuteResponse>;
    executeBscTransfer(
      request: BscTransferExecuteRequest,
    ): Promise<BscTransferExecuteResponse>;
    getBscTradeTxStatus(hash: string): Promise<BscTradeTxStatusResponse>;
    getStewardStatus(): Promise<StewardStatusResponse>;
    getStewardAddresses(): Promise<StewardWalletAddressesResponse>;
    getStewardBalance(chainId?: number): Promise<StewardBalanceResponse>;
    getStewardTokens(chainId?: number): Promise<StewardTokenBalancesResponse>;
    getStewardWebhookEvents(opts?: {
      event?: StewardWebhookEventType;
      since?: number;
    }): Promise<StewardWebhookEventsResponse>;
    getStewardPolicies(): Promise<
      Array<{
        id: string;
        type: string;
        enabled: boolean;
        config: Record<string, unknown>;
      }>
    >;
    setStewardPolicies(
      policies: Array<{
        id: string;
        type: string;
        enabled: boolean;
        config: Record<string, unknown>;
      }>,
    ): Promise<void>;
    getStewardHistory(opts?: {
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<{
      records: StewardHistoryResponse;
      total: number;
      offset: number;
      limit: number;
    }>;
    getStewardPending(): Promise<StewardPendingResponse>;
    approveStewardTx(txId: string): Promise<StewardApprovalActionResponse>;
    rejectStewardTx(
      txId: string,
      reason?: string,
    ): Promise<StewardApprovalActionResponse>;
    signViaSteward(request: StewardSignRequest): Promise<StewardSignResponse>;
    signBrowserWalletMessage(
      message: string,
    ): Promise<BrowserWorkspaceWalletMessageSignatureResult>;
    signBrowserSolanaMessage(request: {
      message?: string;
      messageBase64?: string;
    }): Promise<BrowserWorkspaceSolanaMessageSignatureResult>;
    sendBrowserWalletTransaction(
      request: StewardSignRequest,
    ): Promise<BrowserWorkspaceWalletTransactionResult>;
    getWalletTradingProfile(
      window?: WalletTradingProfileWindow,
      source?: WalletTradingProfileSourceFilter,
    ): Promise<WalletTradingProfileResponse>;
    applyProductionWalletDefaults(): Promise<ApplyProductionWalletDefaultsResponse>;
    getRegistryStatus(): Promise<RegistryStatus>;
    registerAgent(params?: {
      name?: string;
      endpoint?: string;
      tokenURI?: string;
    }): Promise<RegistrationResult>;
    updateRegistryTokenURI(
      tokenURI: string,
    ): Promise<{ ok: boolean; txHash: string }>;
    syncRegistryProfile(params?: {
      name?: string;
      endpoint?: string;
      tokenURI?: string;
    }): Promise<{ ok: boolean; txHash: string }>;
    getRegistryConfig(): Promise<RegistryConfig>;
    getDropStatus(): Promise<DropStatus>;
    mintAgent(params?: {
      name?: string;
      endpoint?: string;
      shiny?: boolean;
    }): Promise<MintResult>;
    mintAgentWhitelist(params: {
      name?: string;
      endpoint?: string;
      proof: string[];
    }): Promise<MintResult>;
    getWhitelistStatus(): Promise<WhitelistStatus>;
    generateTwitterVerificationMessage(): Promise<VerificationMessageResponse>;
    verifyTwitter(tweetUrl: string): Promise<VerificationResult>;
  }
}

// ---------------------------------------------------------------------------
// Prototype augmentation
// ---------------------------------------------------------------------------

TokagentClient.prototype.getWalletAddresses = async function (this: TokagentClient) {
  return this.fetch("/api/wallet/addresses");
};

TokagentClient.prototype.getWalletBalances = async function (this: TokagentClient) {
  return this.fetch("/api/wallet/balances");
};

TokagentClient.prototype.getWalletNfts = async function (this: TokagentClient) {
  return this.fetch("/api/wallet/nfts");
};

TokagentClient.prototype.getWalletConfig = async function (this: TokagentClient) {
  return this.fetch("/api/wallet/config");
};

TokagentClient.prototype.updateWalletConfig = async function (
  this: TokagentClient,
  config,
) {
  return this.fetch("/api/wallet/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
};

TokagentClient.prototype.refreshCloudWallets = async function (this: TokagentClient) {
  return this.fetch("/api/wallet/refresh-cloud", {
    method: "POST",
  });
};

TokagentClient.prototype.setWalletPrimary = async function (
  this: TokagentClient,
  params,
) {
  return this.fetch("/api/wallet/primary", {
    method: "POST",
    body: JSON.stringify(params),
  });
};

TokagentClient.prototype.generateWallet = async function (
  this: TokagentClient,
  params = {},
) {
  return this.fetch("/api/wallet/generate", {
    method: "POST",
    body: JSON.stringify(params),
  });
};

TokagentClient.prototype.exportWalletKeys = async function (
  this: TokagentClient,
  exportToken,
) {
  return this.fetch("/api/wallet/export", {
    method: "POST",
    body: JSON.stringify({ confirm: true, exportToken }),
  });
};

TokagentClient.prototype.getBscTradePreflight = async function (
  this: TokagentClient,
  tokenAddress?,
) {
  return this.fetch("/api/wallet/trade/preflight", {
    method: "POST",
    body: JSON.stringify(
      tokenAddress?.trim() ? { tokenAddress: tokenAddress.trim() } : {},
    ),
  });
};

TokagentClient.prototype.getBscTradeQuote = async function (
  this: TokagentClient,
  request,
) {
  return this.fetch("/api/wallet/trade/quote", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

TokagentClient.prototype.executeBscTrade = async function (
  this: TokagentClient,
  request,
) {
  return this.fetch("/api/wallet/trade/execute", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

TokagentClient.prototype.executeBscTransfer = async function (
  this: TokagentClient,
  request,
) {
  return this.fetch("/api/wallet/transfer/execute", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

TokagentClient.prototype.getBscTradeTxStatus = async function (
  this: TokagentClient,
  hash,
) {
  return this.fetch(
    `/api/wallet/trade/tx-status?hash=${encodeURIComponent(hash)}`,
  );
};

TokagentClient.prototype.getStewardStatus = async function (this: TokagentClient) {
  return this.fetch("/api/wallet/steward-status");
};

TokagentClient.prototype.getStewardAddresses = async function (this: TokagentClient) {
  return this.fetch("/api/wallet/steward-addresses");
};

TokagentClient.prototype.getStewardBalance = async function (
  this: TokagentClient,
  chainId?,
) {
  const qs =
    chainId == null ? "" : `?chainId=${encodeURIComponent(String(chainId))}`;
  return this.fetch(`/api/wallet/steward-balances${qs}`);
};

TokagentClient.prototype.getStewardTokens = async function (
  this: TokagentClient,
  chainId?,
) {
  const qs =
    chainId == null ? "" : `?chainId=${encodeURIComponent(String(chainId))}`;
  return this.fetch(`/api/wallet/steward-tokens${qs}`);
};

TokagentClient.prototype.getStewardWebhookEvents = async function (
  this: TokagentClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.event) params.set("event", opts.event);
  if (opts?.since != null) params.set("since", String(opts.since));
  const qs = params.toString();
  return this.fetch(`/api/wallet/steward-webhook-events${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.getStewardPolicies = async function (this: TokagentClient) {
  return this.fetch("/api/wallet/steward-policies");
};

TokagentClient.prototype.setStewardPolicies = async function (
  this: TokagentClient,
  policies,
) {
  await this.fetch("/api/wallet/steward-policies", {
    method: "PUT",
    body: JSON.stringify({ policies }),
  });
};

TokagentClient.prototype.getStewardHistory = async function (
  this: TokagentClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return this.fetch(`/api/wallet/steward-tx-records${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.getStewardPending = async function (this: TokagentClient) {
  return this.fetch("/api/wallet/steward-pending-approvals");
};

TokagentClient.prototype.approveStewardTx = async function (
  this: TokagentClient,
  txId,
) {
  return this.fetch("/api/wallet/steward-approve-tx", {
    method: "POST",
    body: JSON.stringify({ txId }),
  });
};

TokagentClient.prototype.rejectStewardTx = async function (
  this: TokagentClient,
  txId,
  reason?,
) {
  return this.fetch("/api/wallet/steward-deny-tx", {
    method: "POST",
    body: JSON.stringify({ txId, reason }),
  });
};

TokagentClient.prototype.signViaSteward = async function (
  this: TokagentClient,
  request,
) {
  return this.fetch("/api/wallet/steward-sign", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

TokagentClient.prototype.sendBrowserWalletTransaction = async function (
  this: TokagentClient,
  request,
) {
  return this.fetch("/api/wallet/browser-transaction", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

TokagentClient.prototype.signBrowserWalletMessage = async function (
  this: TokagentClient,
  message,
) {
  return this.fetch("/api/wallet/browser-sign-message", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
};

TokagentClient.prototype.signBrowserSolanaMessage = async function (
  this: TokagentClient,
  request,
) {
  return this.fetch("/api/wallet/browser-solana-sign-message", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

TokagentClient.prototype.getWalletTradingProfile = async function (
  this: TokagentClient,
  window = "30d",
  source = "all",
) {
  const params = new URLSearchParams({ window, source });
  return this.fetch(`/api/wallet/trading/profile?${params.toString()}`);
};

TokagentClient.prototype.applyProductionWalletDefaults = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/wallet/production-defaults", {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
};

TokagentClient.prototype.getRegistryStatus = async function (this: TokagentClient) {
  return this.fetch("/api/registry/status");
};

TokagentClient.prototype.registerAgent = async function (
  this: TokagentClient,
  params?,
) {
  return this.fetch("/api/registry/register", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
};

TokagentClient.prototype.updateRegistryTokenURI = async function (
  this: TokagentClient,
  tokenURI,
) {
  return this.fetch("/api/registry/update-uri", {
    method: "POST",
    body: JSON.stringify({ tokenURI }),
  });
};

TokagentClient.prototype.syncRegistryProfile = async function (
  this: TokagentClient,
  params?,
) {
  return this.fetch("/api/registry/sync", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
};

TokagentClient.prototype.getRegistryConfig = async function (this: TokagentClient) {
  return this.fetch("/api/registry/config");
};

TokagentClient.prototype.getDropStatus = async function (this: TokagentClient) {
  return this.fetch("/api/drop/status");
};

TokagentClient.prototype.mintAgent = async function (this: TokagentClient, params?) {
  return this.fetch("/api/drop/mint", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
};

TokagentClient.prototype.mintAgentWhitelist = async function (
  this: TokagentClient,
  params,
) {
  return this.fetch("/api/drop/mint-whitelist", {
    method: "POST",
    body: JSON.stringify(params),
  });
};

TokagentClient.prototype.getWhitelistStatus = async function (this: TokagentClient) {
  return this.fetch("/api/whitelist/status");
};

TokagentClient.prototype.generateTwitterVerificationMessage = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/whitelist/twitter/message", { method: "POST" });
};

TokagentClient.prototype.verifyTwitter = async function (
  this: TokagentClient,
  tweetUrl,
) {
  return this.fetch("/api/whitelist/twitter/verify", {
    method: "POST",
    body: JSON.stringify({ tweetUrl }),
  });
};
