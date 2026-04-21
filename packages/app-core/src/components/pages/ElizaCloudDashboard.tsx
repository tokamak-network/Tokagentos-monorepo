/**
 * TokagentCloudDashboard — settings "Cloud" section.
 *
 * Two views:
 *   - "overview" (default): account id, balance, status, Top-up button
 *   - "billing":            top-up payment form + auto top-up + portal link
 *
 * The settings cloud tab is deliberately NOT an agent manager — agent
 * lifecycle lives elsewhere (plugins view, dedicated cloud app).
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
} from "@tokagentos/ui";
import {
  ArrowLeft,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  type CloudBillingCheckoutResponse,
  type CloudBillingSettings,
  type CloudBillingSummary,
  client,
} from "../../api";
import { useApp } from "../../state";
import { openExternalUrl } from "../../utils";
import { StripeEmbeddedCheckout } from "../cloud/StripeEmbeddedCheckout";
import {
  autoTopUpFormReducer,
  BILLING_PRESET_AMOUNTS,
  buildAutoTopUpFormState,
  consumeManagedDiscordCallbackUrl,
  consumeManagedGithubCallbackUrl,
  TOKAGENT_CLOUD_INSTANCES_URL,
  TOKAGENT_CLOUD_WEB_URL,
  getBillingAutoTopUp,
  getBillingLimits,
  isRecord,
  normalizeBillingSettings,
  normalizeBillingSummary,
  readBoolean,
  readNumber,
  readString,
  resolveCheckoutUrl,
  resolveCloudAccountIdDisplay,
} from "./cloud-dashboard-utils";

export function CloudDashboard() {
  const {
    t,
    tokagentCloudConnected,
    tokagentCloudCredits,
    tokagentCloudCreditsLow,
    tokagentCloudCreditsCritical,
    tokagentCloudAuthRejected,
    tokagentCloudTopUpUrl,
    tokagentCloudUserId,
    tokagentCloudStatusReason,
    cloudDashboardView,
    tokagentCloudLoginBusy,
    handleCloudLogin,
    handleCloudDisconnect,
    tokagentCloudDisconnecting: cloudDisconnecting,
    setActionNotice,
    setState,
  } = useApp();

  const [refreshing, setRefreshing] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSummary, setBillingSummary] =
    useState<CloudBillingSummary | null>(null);
  const [billingSettings, setBillingSettings] =
    useState<CloudBillingSettings | null>(null);
  const [billingAmount, setBillingAmount] = useState("25");
  const [autoTopUpForm, dispatchAutoTopUpForm] = useReducer(
    autoTopUpFormReducer,
    buildAutoTopUpFormState(null, null),
  );
  const [billingSettingsBusy, setBillingSettingsBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutSession, setCheckoutSession] =
    useState<CloudBillingCheckoutResponse | null>(null);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const mountedRef = useRef(true);
  const handledDiscordCallbackRef = useRef(false);
  const handledGithubCallbackRef = useRef(false);
  const autoTopUpEnabled = autoTopUpForm.enabled;
  const autoTopUpAmount = autoTopUpForm.amount;
  const autoTopUpThreshold = autoTopUpForm.threshold;

  const view = cloudDashboardView;
  const goOverview = useCallback(
    () => setState("cloudDashboardView", "overview"),
    [setState],
  );
  const goBilling = useCallback(
    () => setState("cloudDashboardView", "billing"),
    [setState],
  );

  const fetchBillingData = useCallback(async () => {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const [summaryResponse, settingsResponse] = await Promise.all([
        client.getCloudBillingSummary().catch((err) => ({ __error: err })),
        client.getCloudBillingSettings().catch((err) => ({ __error: err })),
      ]);

      if (!mountedRef.current) return;

      if (isRecord(summaryResponse) && "__error" in summaryResponse) {
        const err = summaryResponse.__error;
        throw err instanceof Error
          ? err
          : new Error(
              t("tokagentclouddashboard.BillingSummaryUnavailable", {
                defaultValue: "Billing summary unavailable.",
              }),
            );
      }

      setBillingSummary(normalizeBillingSummary(summaryResponse));

      if (isRecord(settingsResponse) && !("__error" in settingsResponse)) {
        setBillingSettings(normalizeBillingSettings(settingsResponse));
      } else {
        setBillingSettings(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setBillingSummary(null);
      setBillingSettings(null);
      setBillingError(
        err instanceof Error
          ? err.message
          : t("tokagentclouddashboard.FailedToLoadBillingData", {
              defaultValue: "Failed to load billing data.",
            }),
      );
    } finally {
      if (mountedRef.current) setBillingLoading(false);
    }
  }, [t]);

  useEffect(() => {
    dispatchAutoTopUpForm({
      type: "hydrate",
      next: buildAutoTopUpFormState(billingSummary, billingSettings),
    });
  }, [billingSettings, billingSummary]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBillingData();
    setTimeout(() => setRefreshing(false), 400);
  }, [fetchBillingData]);

  const handleSaveBillingSettings = useCallback(async () => {
    const limits = getBillingLimits(billingSettings);
    const amount = Number(autoTopUpAmount);
    const threshold = Number(autoTopUpThreshold);
    const minAmount = readNumber(limits.minAmount) ?? 1;
    const maxAmount = readNumber(limits.maxAmount) ?? 1000;
    const minThreshold = readNumber(limits.minThreshold) ?? 0;
    const maxThreshold = readNumber(limits.maxThreshold) ?? 1000;
    const hasPaymentMethod =
      readBoolean(getBillingAutoTopUp(billingSettings).hasPaymentMethod) ??
      readBoolean(
        (billingSummary as Record<string, unknown> | null)?.hasPaymentMethod,
      ) ??
      false;

    if (!Number.isFinite(amount) || amount < minAmount || amount > maxAmount) {
      setActionNotice(
        t("tokagentclouddashboard.AutoTopUpAmountRange", {
          defaultValue:
            "Auto top-up amount must be between ${{min}} and ${{max}}.",
          min: minAmount,
          max: maxAmount,
        }),
        "error",
        3600,
      );
      return;
    }

    if (
      !Number.isFinite(threshold) ||
      threshold < minThreshold ||
      threshold > maxThreshold
    ) {
      setActionNotice(
        t("tokagentclouddashboard.AutoTopUpThresholdRange", {
          defaultValue:
            "Auto top-up threshold must be between ${{min}} and ${{max}}.",
          min: minThreshold,
          max: maxThreshold,
        }),
        "error",
        3600,
      );
      return;
    }

    if (autoTopUpEnabled && !hasPaymentMethod) {
      setActionNotice(
        t("tokagentclouddashboard.SavePaymentMethodBeforeAutoTopUp", {
          defaultValue: "Add a card first",
        }),
        "info",
        4200,
      );
      return;
    }

    setBillingSettingsBusy(true);
    try {
      const response = await client.updateCloudBillingSettings({
        autoTopUp: { enabled: autoTopUpEnabled, amount, threshold },
      });
      if (!mountedRef.current) return;
      const normalizedSettings = normalizeBillingSettings(response);
      setBillingSettings(normalizedSettings);
      dispatchAutoTopUpForm({
        type: "hydrate",
        next: buildAutoTopUpFormState(billingSummary, normalizedSettings),
        force: true,
      });
      await fetchBillingData();
      setActionNotice(
        t("tokagentclouddashboard.BillingSettingsUpdated", {
          defaultValue: "Billing settings updated.",
        }),
        "success",
        3200,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error
          ? err.message
          : t("tokagentclouddashboard.FailedToUpdateBillingSettings", {
              defaultValue: "Failed to update billing settings.",
            }),
        "error",
        4200,
      );
    } finally {
      if (mountedRef.current) setBillingSettingsBusy(false);
    }
  }, [
    autoTopUpAmount,
    autoTopUpEnabled,
    autoTopUpThreshold,
    billingSettings,
    billingSummary,
    fetchBillingData,
    setActionNotice,
    t,
  ]);

  const handleStartCheckout = useCallback(async () => {
    const minimumTopUp =
      readNumber(
        (billingSummary as Record<string, unknown> | null)?.minimumTopUp,
      ) ?? 1;
    const amountUsd = Number(billingAmount);
    if (!Number.isFinite(amountUsd) || amountUsd < minimumTopUp) {
      setActionNotice(
        t("tokagentclouddashboard.EnterTopUpAmountMinimum", {
          defaultValue: "Enter a top-up amount of at least ${{amount}}.",
          amount: minimumTopUp,
        }),
        "error",
        3200,
      );
      return;
    }

    setCheckoutBusy(true);
    try {
      const response = await client.createCloudBillingCheckout({
        amountUsd,
        mode: billingSummary?.embeddedCheckoutEnabled ? "embedded" : "hosted",
      });

      const clientSecret = readString(response.clientSecret);
      const publishableKey = readString(response.publishableKey);
      if (clientSecret && publishableKey) {
        setCheckoutSession(response);
        setCheckoutDialogOpen(true);
        return;
      }

      const checkoutUrl = resolveCheckoutUrl(response);
      if (checkoutUrl) {
        await openExternalUrl(checkoutUrl);
        return;
      }

      throw new Error(
        t("tokagentclouddashboard.CheckoutSessionMissing", {
          defaultValue:
            "Checkout unavailable. Try again or use the billing portal.",
        }),
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error
          ? err.message
          : t("tokagentclouddashboard.FailedToStartCheckout", {
              defaultValue: "Failed to start checkout.",
            }),
        "error",
        4200,
      );
    } finally {
      setCheckoutBusy(false);
    }
  }, [billingAmount, billingSummary, setActionNotice, t]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (tokagentCloudConnected) {
      void fetchBillingData();
    }
  }, [tokagentCloudConnected, fetchBillingData]);

  // Drop cached billing on disconnect so we never show a stale balance.
  useEffect(() => {
    if (tokagentCloudConnected) return;
    setBillingSummary(null);
    setBillingSettings(null);
    setBillingError(null);
    setCheckoutSession(null);
    setCheckoutDialogOpen(false);
    dispatchAutoTopUpForm({
      type: "hydrate",
      next: buildAutoTopUpFormState(null, null),
      force: true,
    });
  }, [tokagentCloudConnected]);

  // Managed Discord / GitHub OAuth callbacks: server-side already linked the
  // connection — we just surface a toast and strip query params from the URL.
  useEffect(() => {
    if (handledDiscordCallbackRef.current || typeof window === "undefined") {
      return;
    }
    const { callback, cleanedUrl } = consumeManagedDiscordCallbackUrl(
      window.location.href,
    );
    if (!callback) return;
    handledDiscordCallbackRef.current = true;
    if (cleanedUrl && cleanedUrl !== window.location.href) {
      window.history.replaceState({}, document.title, cleanedUrl);
    }
    if (callback.status === "connected") {
      setActionNotice(
        callback.guildName
          ? t("tokagentclouddashboard.ManagedDiscordConnectedNotice", {
              defaultValue: callback.restarted
                ? "Managed Discord connected to {{guild}}. The agent restarted and is ready."
                : "Managed Discord connected to {{guild}}.",
              guild: callback.guildName,
            })
          : t("tokagentclouddashboard.ManagedDiscordConnectedNoticeFallback", {
              defaultValue: callback.restarted
                ? "Managed Discord connected. The agent restarted and is ready."
                : "Managed Discord connected.",
            }),
        "success",
        5200,
      );
      return;
    }
    setActionNotice(
      callback.message ||
        t("tokagentclouddashboard.ManagedDiscordConnectFailed", {
          defaultValue: "Managed Discord setup did not complete.",
        }),
      "error",
      5200,
    );
  }, [setActionNotice, t]);

  useEffect(() => {
    if (handledGithubCallbackRef.current || typeof window === "undefined") {
      return;
    }
    const { callback, cleanedUrl } = consumeManagedGithubCallbackUrl(
      window.location.href,
    );
    if (!callback) return;
    handledGithubCallbackRef.current = true;
    if (cleanedUrl && cleanedUrl !== window.location.href) {
      window.history.replaceState({}, document.title, cleanedUrl);
    }
    if (callback.status === "connected") {
      setActionNotice(
        t("tokagentclouddashboard.ManagedGithubConnectedNotice", {
          defaultValue: "GitHub account connected to this agent.",
        }),
        "success",
        5200,
      );
      return;
    }
    setActionNotice(
      callback.message ||
        t("tokagentclouddashboard.ManagedGithubConnectFailed", {
          defaultValue: "GitHub setup did not complete.",
        }),
      "error",
      5200,
    );
  }, [setActionNotice, t]);

  const summaryCritical =
    tokagentCloudAuthRejected ||
    (billingSummary?.critical ?? tokagentCloudCreditsCritical ?? false);
  const summaryLow = billingSummary?.low ?? tokagentCloudCreditsLow ?? false;
  const creditStatusColor = summaryCritical
    ? "text-danger"
    : summaryLow
      ? "text-warn"
      : "text-ok";
  const cloudBalanceNumber =
    typeof tokagentCloudCredits === "number"
      ? tokagentCloudCredits
      : typeof billingSummary?.balance === "number"
        ? billingSummary.balance
        : null;
  const cloudCurrency = billingSummary?.currency ?? "USD";
  const fallbackBillingUrl =
    billingSummary?.topUpUrl ?? tokagentCloudTopUpUrl ?? null;
  const minimumTopUp =
    readNumber(
      (billingSummary as Record<string, unknown> | null)?.minimumTopUp,
    ) ?? 1;
  const billingAutoTopUp = getBillingAutoTopUp(billingSettings);
  const billingLimits = getBillingLimits(billingSettings);
  const autoTopUpHasPaymentMethod =
    readBoolean(billingAutoTopUp.hasPaymentMethod) ??
    readBoolean(
      (billingSummary as Record<string, unknown> | null)?.hasPaymentMethod,
    ) ??
    false;
  const autoTopUpMinAmount =
    readNumber(billingLimits.minAmount) ?? minimumTopUp;
  const autoTopUpMaxAmount = readNumber(billingLimits.maxAmount) ?? 1000;
  const autoTopUpMinThreshold = readNumber(billingLimits.minThreshold) ?? 0;
  const autoTopUpMaxThreshold = readNumber(billingLimits.maxThreshold) ?? 1000;
  const creditStatusTone = tokagentCloudAuthRejected
    ? t("notice.tokagentCloudAuthRejected")
    : summaryCritical
      ? t("tokagentclouddashboard.CreditsCritical")
      : summaryLow
        ? t("tokagentclouddashboard.CreditsLow")
        : t("tokagentclouddashboard.CreditsHealthy");
  const statusChipClass = summaryCritical
    ? "border-danger/30 bg-danger/10 text-danger"
    : summaryLow
      ? "border-warn/30 bg-warn/10 text-warn"
      : "border-ok/30 bg-ok/10 text-ok";
  const accountIdDisplay = resolveCloudAccountIdDisplay(
    tokagentCloudUserId,
    tokagentCloudStatusReason,
    t,
  );
  const formattedBalance =
    cloudBalanceNumber !== null ? cloudBalanceNumber.toFixed(2) : null;
  const currencyPrefix = cloudCurrency === "USD" ? "$" : `${cloudCurrency} `;

  /* ── Disconnected: single-button connect view ────────────────────────── */
  if (!tokagentCloudConnected) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center px-4 py-10 text-center">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10">
          <Zap className="h-6 w-6 text-txt" />
        </div>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          {t("tokagentclouddashboard.ScaleYourAgents")}
        </p>
        <Button
          variant="default"
          size="sm"
          className="rounded-xl px-6 py-2.5 text-sm font-semibold"
          onClick={() => void handleCloudLogin()}
          disabled={tokagentCloudLoginBusy}
        >
          {tokagentCloudLoginBusy ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Zap className="mr-2 h-4 w-4" />
          )}
          {tokagentCloudLoginBusy
            ? t("onboarding.connecting")
            : t("tokagentclouddashboard.ConnectTokagentCloud")}
        </Button>
        <Button
          variant="link"
          className="mt-3 h-auto p-0 text-xs text-muted"
          onClick={() => void openExternalUrl(TOKAGENT_CLOUD_WEB_URL)}
        >
          {t("tokagentclouddashboard.LearnMore")}
        </Button>
      </div>
    );
  }

  /* ── Overview (default view): account + balance + actions ────────────── */
  const overviewContent = (
    <div className="px-5 py-6 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
            {t("tokagentclouddashboard.Balance", { defaultValue: "Balance" })}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-bold tracking-tight tabular-nums ${creditStatusColor}`}
            >
              {currencyPrefix}
              {formattedBalance ?? (
                <span className="text-muted">{billingLoading ? "…" : "—"}</span>
              )}
            </span>
            {billingLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted" />
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wider ${statusChipClass}`}
        >
          {creditStatusTone}
        </span>
      </div>

      {tokagentCloudAuthRejected && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {t("notice.tokagentCloudAuthRejected")}
        </div>
      )}

      {billingError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {billingError}
        </div>
      )}

      <dl className="mb-6 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">
            {t("tokagentclouddashboard.Account", { defaultValue: "Account" })}
          </dt>
          <dd className="min-w-0">
            {accountIdDisplay.mono ? (
              <code className="truncate font-mono text-txt">
                {accountIdDisplay.text}
              </code>
            ) : (
              <span className="truncate text-txt">{accountIdDisplay.text}</span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">
            {t("tokagentclouddashboard.AutoTopUp", {
              defaultValue: "Auto top-up",
            })}
          </dt>
          <dd className="text-txt">
            {billingAutoTopUp.enabled
              ? t("tokagentclouddashboard.OnAmount", {
                  defaultValue: "On · ${{amount}} when below ${{threshold}}",
                  amount: Number(autoTopUpForm.amount).toFixed(0),
                  threshold: Number(autoTopUpForm.threshold).toFixed(0),
                })
              : t("tokagentclouddashboard.Off", { defaultValue: "Off" })}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="default"
          size="sm"
          className="rounded-lg font-semibold"
          onClick={goBilling}
        >
          <CreditCard className="mr-1.5 h-3.5 w-3.5" />
          {t("tokagentclouddashboard.TopUpCredits", {
            defaultValue: "Top up credits",
          })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={handleRefresh}
          disabled={refreshing || billingLoading}
        >
          <RefreshCw
            className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          {t("common.refresh")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg border-danger/30 text-danger hover:bg-danger/10"
          onClick={() => void handleCloudDisconnect()}
          disabled={cloudDisconnecting}
        >
          {cloudDisconnecting
            ? t("providerswitcher.disconnecting")
            : t("providerswitcher.disconnect")}
        </Button>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs text-muted hover:text-txt"
            onClick={() => void openExternalUrl(TOKAGENT_CLOUD_INSTANCES_URL)}
          >
            {t("tokagentclouddashboard.AdvancedDashboard")}
            <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );

  /* ── Billing (payment) flip view ─────────────────────────────────────── */
  const billingContent = (
    <div className="px-5 py-6 sm:px-6">
      <div className="mb-5 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-lg px-2 text-muted hover:text-txt"
          onClick={goOverview}
          aria-label={t("common.back", { defaultValue: "Back" })}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold text-txt-strong">
          {t("tokagentclouddashboard.TopUpCredits", {
            defaultValue: "Top up credits",
          })}
        </h3>
        <span className="ml-auto text-xs text-muted tabular-nums">
          {currencyPrefix}
          {formattedBalance ?? (billingLoading ? "…" : "—")}
        </span>
      </div>

      {billingError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {billingError}
        </div>
      )}

      {/* Pay with card */}
      <div className="mb-6">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
          {t("tokagentclouddashboard.PayWithCard")}
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {BILLING_PRESET_AMOUNTS.map((amount) => {
            const active = billingAmount === String(amount);
            return (
              <Button
                key={amount}
                variant={active ? "default" : "outline"}
                size="sm"
                className="h-8 rounded-lg px-3 text-xs font-medium"
                onClick={() => setBillingAmount(String(amount))}
              >
                ${amount}
              </Button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Input
            id="cloud-billing-amount"
            type="number"
            min={String(minimumTopUp)}
            step="1"
            value={billingAmount}
            onChange={(e) => setBillingAmount(e.target.value)}
            className="h-9 flex-1 rounded-lg bg-bg text-sm"
            placeholder={t("tokagentclouddashboard.MinAmountPlaceholder", {
              defaultValue: "Min ${{amount}}",
              amount: minimumTopUp.toFixed(2),
            })}
          />
          <Button
            variant="default"
            size="sm"
            className="h-9 rounded-lg px-4 font-semibold"
            disabled={checkoutBusy || billingLoading}
            onClick={() => void handleStartCheckout()}
          >
            {checkoutBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("tokagentclouddashboard.Pay", { defaultValue: "Pay" })
            )}
          </Button>
        </div>
      </div>

      {/* Auto top-up */}
      <div className="mb-6 border-t border-border/40 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">
              {t("tokagentclouddashboard.AutoTopUp")}
            </div>
            <p className="mt-0.5 text-xs-tight text-muted">
              {autoTopUpHasPaymentMethod
                ? t("tokagentclouddashboard.AutoTopUpPaymentReady", {
                    defaultValue: "Card saved",
                  })
                : t("tokagentclouddashboard.AutoTopUpNeedsPaymentMethod", {
                    defaultValue: "Add a card first",
                  })}
            </p>
          </div>
          <Switch
            checked={autoTopUpEnabled}
            onCheckedChange={(v: boolean) =>
              dispatchAutoTopUpForm({ type: "setEnabled", value: v })
            }
            aria-label={t("tokagentclouddashboard.ToggleAutoTopUp")}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label
              htmlFor="cloud-auto-topup-threshold"
              className="text-xs-tight text-muted"
            >
              {t("tokagentclouddashboard.RefillWhenBelow", {
                defaultValue: "Refill when below",
              })}
            </label>
            <Input
              id="cloud-auto-topup-threshold"
              type="number"
              min={String(autoTopUpMinThreshold)}
              max={String(autoTopUpMaxThreshold)}
              step="1"
              value={autoTopUpThreshold}
              onChange={(e) =>
                dispatchAutoTopUpForm({
                  type: "setThreshold",
                  value: e.target.value,
                })
              }
              className="h-9 rounded-lg bg-bg"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label
              htmlFor="cloud-auto-topup-amount"
              className="text-xs-tight text-muted"
            >
              {t("tokagentclouddashboard.TopUpAmount", {
                defaultValue: "Top-up amount",
              })}
            </label>
            <Input
              id="cloud-auto-topup-amount"
              type="number"
              min={String(autoTopUpMinAmount)}
              max={String(autoTopUpMaxAmount)}
              step="1"
              value={autoTopUpAmount}
              onChange={(e) =>
                dispatchAutoTopUpForm({
                  type: "setAmount",
                  value: e.target.value,
                })
              }
              className="h-9 rounded-lg bg-bg"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg px-4 sm:self-end"
            disabled={
              billingSettingsBusy || billingLoading || !autoTopUpForm.dirty
            }
            onClick={() => void handleSaveBillingSettings()}
          >
            {billingSettingsBusy && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            {t("apikeyconfig.save")}
          </Button>
        </div>
      </div>

      {fallbackBillingUrl && (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0 text-xs text-muted hover:text-txt"
          onClick={() => void openExternalUrl(fallbackBillingUrl)}
        >
          {t("tokagentclouddashboard.OpenBrowserBilling")}
          <ExternalLink className="ml-1 h-3 w-3" />
        </Button>
      )}
    </div>
  );

  return (
    <>
      {view === "billing" ? billingContent : overviewContent}

      <Dialog
        open={checkoutDialogOpen}
        onOpenChange={(open: boolean) => {
          setCheckoutDialogOpen(open);
          if (!open) void fetchBillingData();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("tokagentclouddashboard.PayWithCard")}</DialogTitle>
          </DialogHeader>
          {checkoutSession?.clientSecret && checkoutSession.publishableKey ? (
            <StripeEmbeddedCheckout
              publishableKey={checkoutSession.publishableKey}
              clientSecret={checkoutSession.clientSecret}
            />
          ) : (
            <div className="rounded-2xl border border-border/40 bg-bg/25 px-4 py-5 text-sm text-muted">
              {t("tokagentclouddashboard.CheckoutProviderNote")}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
