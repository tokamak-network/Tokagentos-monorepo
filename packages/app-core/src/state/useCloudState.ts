/**
 * Tokagent Cloud state — extracted from AppContext.
 *
 * Manages:
 * - Cloud connection state (enabled, connected, persisted key, user ID)
 * - Credits state (balance, low/critical thresholds, errors, top-up URL)
 * - Login / disconnect flow (busy flags, error messages, poll timers)
 * - Cloud dashboard view preference
 * - Auth-rejected notice effect
 *
 * Cross-domain dependencies accepted as params:
 * - `setActionNotice`        — from useLifecycleState, used for disconnect / auth notices
 * - `loadWalletConfig`       — from useWalletState, called after successful login
 * - `t`                      — translation function, used for auth-rejected notice key
 *
 * Note: `handleCloudOnboardingFinish` is kept in AppContext (one-liner that calls
 * `submitOnboardingAndComplete`, which is defined later in AppContext's render order).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../api";
import {
  invokeDesktopBridgeRequestWithTimeout,
  isElectrobunRuntime,
} from "../bridge";
import { getBootConfig, setBootConfig } from "../config/boot-config";
import { dispatchTokagentCloudStatusUpdated } from "../events";
import {
  confirmDesktopAction,
  openExternalUrl,
  yieldHttpAfterNativeMessageBox,
} from "../utils";

// ── Constants ──────────────────────────────────────────────────────────────

const TOKAGENT_CLOUD_LOGIN_POLL_INTERVAL_MS = 1000;
const TOKAGENT_CLOUD_LOGIN_TIMEOUT_MS = 300_000;
const TOKAGENT_CLOUD_LOGIN_MAX_CONSECUTIVE_ERRORS = 3;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Publish server cloud snapshot for chat TTS (`useVoiceChat` + `loadVoiceConfig`). */
function publishTokagentCloudVoiceSnapshot(
  setHasPersistedKey: (value: boolean) => void,
  snapshot: {
    apiConnected: boolean;
    enabled: boolean;
    cloudVoiceProxyAvailable: boolean;
    hasPersistedApiKey: boolean;
  },
): void {
  setHasPersistedKey(snapshot.hasPersistedApiKey);
  dispatchTokagentCloudStatusUpdated({
    connected: snapshot.apiConnected,
    enabled: snapshot.enabled,
    hasPersistedApiKey: snapshot.hasPersistedApiKey,
    cloudVoiceProxyAvailable: snapshot.cloudVoiceProxyAvailable,
  });
}

// ── Types ──────────────────────────────────────────────────────────────────

interface CloudStateParams {
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
    once?: boolean,
    busy?: boolean,
  ) => void;
  /** From useWalletState — called after successful cloud login to reload wallet. */
  loadWalletConfig: () => Promise<void>;
  /** Translation function — used for the auth-rejected notice. */
  t: (key: string) => string;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useCloudState({
  setActionNotice,
  loadWalletConfig,
  t,
}: CloudStateParams) {
  // ── State ──────────────────────────────────────────────────────────

  const [tokagentCloudEnabled, setTokagentCloudEnabled] = useState(false);
  const [tokagentCloudVoiceProxyAvailable, setTokagentCloudVoiceProxyAvailable] =
    useState(false);
  const [tokagentCloudConnected, setTokagentCloudConnected] = useState(false);
  const [tokagentCloudHasPersistedKey, setTokagentCloudHasPersistedKey] =
    useState(false);
  const [tokagentCloudCredits, setTokagentCloudCredits] = useState<number | null>(
    null,
  );
  const [tokagentCloudCreditsLow, setTokagentCloudCreditsLow] = useState(false);
  const [tokagentCloudCreditsCritical, setTokagentCloudCreditsCritical] =
    useState(false);
  const [tokagentCloudAuthRejected, setTokagentCloudAuthRejected] = useState(false);
  const [tokagentCloudCreditsError, setTokagentCloudCreditsError] = useState<
    string | null
  >(null);
  const [tokagentCloudTopUpUrl, setTokagentCloudTopUpUrl] =
    useState("/cloud/billing");
  const [tokagentCloudUserId, setTokagentCloudUserId] = useState<string | null>(null);
  const [tokagentCloudStatusReason, setTokagentCloudStatusReason] = useState<
    string | null
  >(null);
  const [tokagentCloudLoginBusy, setTokagentCloudLoginBusy] = useState(false);
  const [tokagentCloudLoginError, setTokagentCloudLoginError] = useState<
    string | null
  >(null);
  const [tokagentCloudDisconnecting, setTokagentCloudDisconnecting] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────

  /** Recurring interval that polls cloud credits every 60s while connected. */
  const tokagentCloudPollInterval = useRef<number | null>(null);
  /** While true, ignore stale poll results (in-flight GETs may predate POST /api/cloud/disconnect). */
  const tokagentCloudDisconnectInFlightRef = useRef(false);
  /**
   * After the user disconnects, keep the "Connect Tokagent Cloud" screen until they start
   * login again, even if GET /api/cloud/status still reports `connected: true` (laggy
   * snapshot or proxy mismatch).
   */
  const tokagentCloudPreferDisconnectedUntilLoginRef = useRef(false);
  /** Last `connected` applied by pollCloudCredits; used when a poll is skipped mid-flight. */
  const lastTokagentCloudPollConnectedRef = useRef(false);
  /** Short-lived polling interval used during the browser-based login flow. */
  const tokagentCloudLoginPollTimer = useRef<number | null>(null);
  /** Synchronous lock to prevent duplicate login clicks in the same tick. */
  const tokagentCloudLoginBusyRef = useRef(false);
  /** Tracks whether the auth-rejected notice has already been sent for the current rejection. */
  const tokagentCloudAuthNoticeSentRef = useRef(false);
  /**
   * Forward ref so handleOnboardingNext (defined earlier in AppContext) can call
   * handleCloudLogin (defined later).
   */
  const handleCloudLoginRef = useRef<() => Promise<void>>(async () => {});

  // ── Callbacks ──────────────────────────────────────────────────────

  const pollCloudCredits = useCallback(async (): Promise<boolean> => {
    if (tokagentCloudDisconnectInFlightRef.current) {
      return lastTokagentCloudPollConnectedRef.current;
    }
    const cloudStatus = await client.getCloudStatus().catch(() => null);
    if (tokagentCloudDisconnectInFlightRef.current) {
      return lastTokagentCloudPollConnectedRef.current;
    }
    if (!cloudStatus) {
      // Preserve the last applied cloud snapshot across transient backend
      // restarts so the UI does not flap into a false "disconnected" state.
      return lastTokagentCloudPollConnectedRef.current;
    }
    const enabled = Boolean(cloudStatus.enabled ?? false);
    const cloudVoiceProxyAvailable = Boolean(
      cloudStatus.cloudVoiceProxyAvailable ?? false,
    );
    const hasPersistedApiKey = Boolean(cloudStatus.hasApiKey);
    // Trust `connected` from the server snapshot (it already folds in API key + CLOUD_AUTH).
    const isConnected = Boolean(cloudStatus.connected);
    if (isConnected && tokagentCloudPreferDisconnectedUntilLoginRef.current) {
      publishTokagentCloudVoiceSnapshot(setTokagentCloudHasPersistedKey, {
        apiConnected: isConnected,
        enabled,
        cloudVoiceProxyAvailable,
        hasPersistedApiKey,
      });
      lastTokagentCloudPollConnectedRef.current = false;
      return false;
    }
    if (!isConnected) {
      tokagentCloudPreferDisconnectedUntilLoginRef.current = false;
    }
    setTokagentCloudEnabled(enabled);
    setTokagentCloudVoiceProxyAvailable(cloudVoiceProxyAvailable);
    setTokagentCloudConnected(isConnected);
    publishTokagentCloudVoiceSnapshot(setTokagentCloudHasPersistedKey, {
      apiConnected: isConnected,
      enabled,
      cloudVoiceProxyAvailable,
      hasPersistedApiKey,
    });
    setTokagentCloudUserId(cloudStatus.userId ?? null);
    setTokagentCloudStatusReason(
      isConnected &&
        typeof cloudStatus.reason === "string" &&
        cloudStatus.reason.trim()
        ? cloudStatus.reason.trim()
        : null,
    );
    if (cloudStatus.topUpUrl) setTokagentCloudTopUpUrl(cloudStatus.topUpUrl);
    if (isConnected) {
      const credits = await client.getCloudCredits().catch(() => null);
      if (tokagentCloudDisconnectInFlightRef.current) {
        return lastTokagentCloudPollConnectedRef.current;
      }
      if (credits?.authRejected) {
        setTokagentCloudAuthRejected(true);
        setTokagentCloudCreditsError(null);
        setTokagentCloudCredits(null);
        setTokagentCloudCreditsLow(false);
        setTokagentCloudCreditsCritical(false);
        if (credits.topUpUrl) setTokagentCloudTopUpUrl(credits.topUpUrl);
      } else {
        setTokagentCloudAuthRejected(false);
        const apiErr =
          credits &&
          typeof credits.error === "string" &&
          credits.error.trim() &&
          typeof credits.balance !== "number"
            ? credits.error.trim()
            : null;
        setTokagentCloudCreditsError(apiErr);
        if (credits && typeof credits.balance === "number") {
          setTokagentCloudCredits(credits.balance);
          setTokagentCloudCreditsLow(credits.low ?? false);
          setTokagentCloudCreditsCritical(credits.critical ?? false);
          if (credits.topUpUrl) setTokagentCloudTopUpUrl(credits.topUpUrl);
        } else {
          setTokagentCloudCredits(null);
          setTokagentCloudCreditsLow(false);
          setTokagentCloudCreditsCritical(false);
          if (credits?.topUpUrl) setTokagentCloudTopUpUrl(credits.topUpUrl);
        }
      }
    } else {
      setTokagentCloudCredits(null);
      setTokagentCloudCreditsLow(false);
      setTokagentCloudCreditsCritical(false);
      setTokagentCloudAuthRejected(false);
      setTokagentCloudCreditsError(null);
      setTokagentCloudStatusReason(null);
    }
    lastTokagentCloudPollConnectedRef.current = isConnected;
    // Self-manage the recurring poll interval: start when connected, stop when not.
    // This covers login during onboarding (interval wasn't started at mount) and
    // disconnect (interval should stop to avoid useless API calls).
    if (isConnected && !tokagentCloudPollInterval.current) {
      tokagentCloudPollInterval.current = window.setInterval(() => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState !== "visible"
        ) {
          return;
        }
        void pollCloudCredits();
      }, 60_000);
    } else if (!isConnected && tokagentCloudPollInterval.current) {
      clearInterval(tokagentCloudPollInterval.current);
      tokagentCloudPollInterval.current = null;
    }
    return isConnected;
  }, []);

  const handleCloudLogin = useCallback(async () => {
    // Already connected (existing API key) — no need to re-authenticate.
    if (tokagentCloudConnected) return;
    if (tokagentCloudLoginBusyRef.current || tokagentCloudLoginBusy) return;
    tokagentCloudLoginBusyRef.current = true;
    setTokagentCloudLoginBusy(true);
    setTokagentCloudLoginError(null);
    tokagentCloudPreferDisconnectedUntilLoginRef.current = false;

    // Determine if we should use direct cloud auth (no local backend) or
    // go through the local agent's proxy.
    const hasBackend = Boolean(client.getBaseUrl());
    const cloudApiBase =
      getBootConfig().cloudApiBase ?? "https://www.tokagentcloud.ai";
    const useDirectAuth = !hasBackend;

    if (hasBackend) {
      const alreadyConnected = await pollCloudCredits();
      if (alreadyConnected) {
        await loadWalletConfig().catch(() => undefined);
        setTokagentCloudLoginError(null);
        setActionNotice("Already connected to Tokagent Cloud.", "info", 4000);
        tokagentCloudLoginBusyRef.current = false;
        setTokagentCloudLoginBusy(false);
        return;
      }
    }

    try {
      let resp: {
        ok: boolean;
        browserUrl?: string;
        sessionId?: string;
        error?: string;
      };
      if (useDirectAuth) {
        resp = await client.cloudLoginDirect(cloudApiBase);
      } else {
        resp = await client.cloudLogin();
      }
      if (!resp.ok) {
        setTokagentCloudLoginError(
          resp.error || "Failed to start Tokagent Cloud login",
        );
        tokagentCloudLoginBusyRef.current = false;
        setTokagentCloudLoginBusy(false);
        return;
      }

      // Open the login URL in the system browser.
      if (resp.browserUrl) {
        try {
          await openExternalUrl(resp.browserUrl);
        } catch {
          // Popup was blocked — show a clickable link so the user can open it.
          setTokagentCloudLoginError(
            `Open this link to log in: ${resp.browserUrl}`,
          );
        }
      }

      const sessionId = resp.sessionId ?? "";

      let pollInFlight = false;
      let consecutivePollErrors = 0;
      const pollDeadline = Date.now() + TOKAGENT_CLOUD_LOGIN_TIMEOUT_MS;
      const stopCloudLoginPolling = (error: string | null = null) => {
        if (tokagentCloudLoginPollTimer.current !== null) {
          clearInterval(tokagentCloudLoginPollTimer.current);
          tokagentCloudLoginPollTimer.current = null;
        }
        tokagentCloudLoginBusyRef.current = false;
        setTokagentCloudLoginBusy(false);
        if (error !== null) {
          setTokagentCloudLoginError(error);
        }
      };

      // Start polling
      tokagentCloudLoginPollTimer.current = window.setInterval(async () => {
        if (!tokagentCloudLoginPollTimer.current || pollInFlight) return;
        if (Date.now() >= pollDeadline) {
          stopCloudLoginPolling(
            "Tokagent Cloud login timed out. Please try again.",
          );
          return;
        }

        pollInFlight = true;
        try {
          if (!tokagentCloudLoginPollTimer.current) return;
          let poll: {
            status: string;
            token?: string;
            userId?: string;
            error?: string;
          };
          if (useDirectAuth) {
            poll = await client.cloudLoginPollDirect(cloudApiBase, sessionId);
          } else {
            poll = await client.cloudLoginPoll(sessionId);
          }
          if (!tokagentCloudLoginPollTimer.current) return;

          consecutivePollErrors = 0;
          if (poll.status === "authenticated") {
            stopCloudLoginPolling();
            setTokagentCloudConnected(true);
            setTokagentCloudLoginError(null);
            if (poll.userId) {
              setTokagentCloudUserId(poll.userId);
            }

            // Store the cloud auth token for provisioning
            if (poll.token && typeof window !== "undefined") {
              (
                globalThis as Record<string, unknown>
              ).__TOKAGENT_CLOUD_AUTH_TOKEN__ = poll.token;
              // Also update boot config so subsequent reads use the resolved cloud base.
              const cfg = getBootConfig();
              setBootConfig({ ...cfg, cloudApiBase });
            }

            setActionNotice(
              "Logged in to Tokagent Cloud successfully.",
              "success",
              6000,
            );
            if (useDirectAuth && poll.token) {
              // Direct auth bypasses the backend's login/status handler, so
              // the API key was never persisted server-side. Send it now so
              // billing/compat routes can authenticate with Tokagent Cloud.
              void fetch("/api/cloud/login/persist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey: poll.token }),
              }).catch(() => {
                // Non-fatal: credits/billing will fail but core chat works
              });
            }

            // The backend owns the cloud-wallet bind + runtime reload now.
            // Startup/ws recovery will rehydrate wallet + cloud state once the
            // restart completes, so avoid kicking off a second client restart.
          } else if (poll.status === "expired" || poll.status === "error") {
            stopCloudLoginPolling(
              poll.error ?? "Login session expired. Please try again.",
            );
          }
        } catch (pollErr) {
          console.error("Tokagent Cloud login poll error:", pollErr);
          if (!tokagentCloudLoginPollTimer.current) return;

          consecutivePollErrors += 1;
          if (
            consecutivePollErrors >= TOKAGENT_CLOUD_LOGIN_MAX_CONSECUTIVE_ERRORS
          ) {
            const detail =
              pollErr instanceof Error && pollErr.message
                ? ` Last error: ${pollErr.message}`
                : "";
            stopCloudLoginPolling(
              `Tokagent Cloud login check failed after repeated errors.${detail}`,
            );
          }
        } finally {
          pollInFlight = false;
        }
      }, TOKAGENT_CLOUD_LOGIN_POLL_INTERVAL_MS);
    } catch (err) {
      setTokagentCloudLoginError(
        err instanceof Error ? err.message : "Tokagent Cloud login failed",
      );
      tokagentCloudLoginBusyRef.current = false;
      setTokagentCloudLoginBusy(false);
    }
  }, [
    tokagentCloudConnected,
    tokagentCloudLoginBusy,
    setActionNotice,
    pollCloudCredits,
    loadWalletConfig,
  ]);

  // Keep forward ref in sync so handleOnboardingNext can call it.
  handleCloudLoginRef.current = handleCloudLogin;

  const handleCloudDisconnect = useCallback(async () => {
    const MAIN_CONFIRM_DISCONNECT_MS = 300_000;
    const MAIN_POST_ONLY_MS = 12_000;
    const RENDERER_DISCONNECT_MS = 12_000;

    tokagentCloudDisconnectInFlightRef.current = true;
    setTokagentCloudDisconnecting(true);

    try {
      let needRendererDisconnect = true;

      if (isElectrobunRuntime()) {
        const combined = await invokeDesktopBridgeRequestWithTimeout<
          { cancelled: true } | { ok: true } | { ok: false; error?: string }
        >({
          rpcMethod: "agentCloudDisconnectWithConfirm",
          ipcChannel: "agent:cloudDisconnectWithConfirm",
          params: {
            apiBase: client.getBaseUrl().trim() || undefined,
            bearerToken: client.getRestAuthToken() ?? undefined,
          },
          timeoutMs: MAIN_CONFIRM_DISCONNECT_MS,
        });

        if (combined.status === "ok" && combined.value) {
          const v = combined.value;
          if ("cancelled" in v && v.cancelled) {
            return;
          }
          if ("ok" in v) {
            if (
              v.ok === false &&
              typeof v.error === "string" &&
              v.error.trim()
            ) {
              throw new Error(v.error.trim());
            }
            if (v.ok === true) {
              needRendererDisconnect = false;
            }
          }
        }

        if (needRendererDisconnect) {
          if (
            !(await confirmDesktopAction({
              title: "Disconnect from Tokagent Cloud",
              message:
                "The agent will need a local AI provider to continue working.",
              confirmLabel: "Disconnect",
              cancelLabel: "Cancel",
              type: "warning",
            }))
          ) {
            return;
          }
          await yieldHttpAfterNativeMessageBox();

          const postOutcome = await invokeDesktopBridgeRequestWithTimeout<{
            ok: boolean;
            error?: string;
          }>({
            rpcMethod: "agentPostCloudDisconnect",
            ipcChannel: "agent:postCloudDisconnect",
            params: {
              apiBase: client.getBaseUrl().trim() || undefined,
              bearerToken: client.getRestAuthToken() ?? undefined,
            },
            timeoutMs: MAIN_POST_ONLY_MS,
          });

          if (postOutcome.status === "ok" && postOutcome.value) {
            const mr = postOutcome.value;
            if (mr.ok === true) {
              needRendererDisconnect = false;
            } else if (
              mr.ok === false &&
              typeof mr.error === "string" &&
              mr.error.trim()
            ) {
              throw new Error(mr.error.trim());
            }
          }
        }
      } else if (
        !(await confirmDesktopAction({
          title: "Disconnect from Tokagent Cloud",
          message:
            "The agent will need a local AI provider to continue working.",
          confirmLabel: "Disconnect",
          cancelLabel: "Cancel",
          type: "warning",
        }))
      ) {
        return;
      } else {
        await yieldHttpAfterNativeMessageBox();
      }

      if (needRendererDisconnect) {
        await Promise.race([
          client.cloudDisconnect(),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => {
              reject(
                new Error(
                  `Disconnect timed out after ${RENDERER_DISCONNECT_MS / 1000}s`,
                ),
              );
            }, RENDERER_DISCONNECT_MS);
          }),
        ]);
      }

      setTokagentCloudEnabled(false);
      setTokagentCloudConnected(false);
      publishTokagentCloudVoiceSnapshot(setTokagentCloudHasPersistedKey, {
        apiConnected: false,
        enabled: false,
        cloudVoiceProxyAvailable: false,
        hasPersistedApiKey: false,
      });
      setTokagentCloudVoiceProxyAvailable(false);
      setTokagentCloudCredits(null);
      setTokagentCloudCreditsLow(false);
      setTokagentCloudCreditsCritical(false);
      setTokagentCloudAuthRejected(false);
      setTokagentCloudCreditsError(null);
      setTokagentCloudUserId(null);
      setTokagentCloudStatusReason(null);
      lastTokagentCloudPollConnectedRef.current = false;
      tokagentCloudPreferDisconnectedUntilLoginRef.current = true;
      setActionNotice("Disconnected from Tokagent Cloud.", "success");
    } catch (err) {
      setActionNotice(
        `Failed to disconnect: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      tokagentCloudDisconnectInFlightRef.current = false;
      setTokagentCloudDisconnecting(false);
      void pollCloudCredits();
    }
  }, [pollCloudCredits, setActionNotice]);

  // ── Effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (tokagentCloudAuthRejected) {
      if (!tokagentCloudAuthNoticeSentRef.current) {
        tokagentCloudAuthNoticeSentRef.current = true;
        setActionNotice(t("notice.tokagentCloudAuthRejected"), "error", 14_000);
      }
    } else {
      tokagentCloudAuthNoticeSentRef.current = false;
    }
  }, [tokagentCloudAuthRejected, setActionNotice, t]);

  // ── Return ─────────────────────────────────────────────────────────

  return {
    // State
    tokagentCloudEnabled,
    setTokagentCloudEnabled,
    tokagentCloudVoiceProxyAvailable,
    setTokagentCloudVoiceProxyAvailable,
    tokagentCloudConnected,
    setTokagentCloudConnected,
    tokagentCloudHasPersistedKey,
    setTokagentCloudHasPersistedKey,
    tokagentCloudCredits,
    setTokagentCloudCredits,
    tokagentCloudCreditsLow,
    setTokagentCloudCreditsLow,
    tokagentCloudCreditsCritical,
    setTokagentCloudCreditsCritical,
    tokagentCloudAuthRejected,
    setTokagentCloudAuthRejected,
    tokagentCloudCreditsError,
    setTokagentCloudCreditsError,
    tokagentCloudTopUpUrl,
    setTokagentCloudTopUpUrl,
    tokagentCloudUserId,
    setTokagentCloudUserId,
    tokagentCloudStatusReason,
    setTokagentCloudStatusReason,
    tokagentCloudLoginBusy,
    setTokagentCloudLoginBusy,
    tokagentCloudLoginError,
    setTokagentCloudLoginError,
    tokagentCloudDisconnecting,
    setTokagentCloudDisconnecting,
    // Refs (exposed for cleanup in AppContext's startup effect and for forward ref)
    tokagentCloudPollInterval,
    tokagentCloudDisconnectInFlightRef,
    tokagentCloudPreferDisconnectedUntilLoginRef,
    lastTokagentCloudPollConnectedRef,
    tokagentCloudLoginPollTimer,
    tokagentCloudLoginBusyRef,
    handleCloudLoginRef,
    // Callbacks
    pollCloudCredits,
    handleCloudLogin,
    handleCloudDisconnect,
  };
}
