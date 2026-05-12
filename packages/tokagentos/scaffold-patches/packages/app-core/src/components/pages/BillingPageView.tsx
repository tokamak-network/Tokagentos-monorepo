/**
 * BillingPageView — embeds the operator billing dashboard inside the main
 * app shell via an iframe.
 *
 * The dashboard is a vanilla-JS SPA served by the tokagent-billing plugin
 * at /v1/billing/dashboard. It handles SIWE login, PTON top-up, API key
 * issuance, credit ledger inspection, and 90-day usage history. We embed
 * it via iframe so the dashboard's vanilla-JS surface stays decoupled from
 * the scaffold's React tree — the plugin can iterate on the dashboard
 * without re-publishing app-core overlays.
 *
 * When billing isn't yet configured (BILLING_ENABLED=false), the iframe
 * loads the setup-panel HTML wizard instead. The plugin's /v1/billing/status
 * endpoint reports `{enabled:bool}` — we hit it once on mount and pick the
 * right URL. Either way the user sees a fixed Billing tab; the content
 * just routes to the right entry point.
 *
 * Theme handoff (parent → dashboard):
 *   1. The iframe src carries `?embed=1` as a first-paint hint. The
 *      dashboard's pre-paint script reads it and sets <html data-embed="1">
 *      before stylesheet evaluation, so it never flashes the standalone
 *      topbar inside the parent shell.
 *   2. After the iframe loads we postMessage a small token bundle keyed
 *      to the parent app's locked dark lime palette (parent has no rich
 *      theme state to read, so the values are hardcoded here — the
 *      dashboard's stylesheet keys every visual off :root custom props,
 *      so a single push re-skins the UI without touching iframe markup).
 */

import { useEffect, useRef, useState } from "react";

// Locked dark-lime tokens from apps/app/src/brand-purple.css. The dashboard
// uses CSS custom properties of the same names, so this object is a direct
// :root override on the iframe document. Kept inline (not imported) because
// scaffold-patches must stay independent of any specific app's bundling.
const PARENT_THEME_TOKENS = {
  bg0: "#0a0a0f",
  bg1: "rgba(255,255,255,0.05)",
  bg2: "#111118",
  line: "rgba(255,255,255,0.10)",
  text: "#ffffff",
  muted: "#9ca3af",
  accent: "#c4f547",
  accent2: "#c4f547",
} as const;

function BillingPageView(): React.ReactElement {
  // Pick the dashboard if billing is configured, the setup wizard if not.
  // Both URLs go through the Vite dev proxy (/v1/* → agent API on 31337).
  // `?embed=1` flips the dashboard's embed-mode flag at first paint.
  const [src, setSrc] = useState<string>("/v1/billing/dashboard?embed=1");
  const [loading, setLoading] = useState<boolean>(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/v1/billing/status")
      .then((res) => (res.ok ? (res.json() as Promise<{ enabled: boolean }>) : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setSrc(
          json.enabled === true
            ? "/v1/billing/dashboard?embed=1"
            : "/v1/billing/setup-panel?embed=1",
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Plugin unreachable — default to setup-panel so the user has an
        // entry point even if the agent is mid-boot.
        setSrc("/v1/billing/setup-panel?embed=1");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Push theme tokens once the iframe has loaded. The dashboard listens
  // for `{ source: "tal-host", type: "theme", tokens }` messages and
  // writes the values onto :root via document.documentElement.style.
  const handleIframeLoad = (): void => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    try {
      w.postMessage(
        {
          source: "tal-host",
          type: "theme",
          tokens: PARENT_THEME_TOKENS,
          mode: "dark",
        },
        location.origin,
      );
    } catch {
      // Same-origin postMessage is best-effort; first-paint query param
      // already covers the styling, so swallow the failure silently.
    }
  };

  // Use flex-fill (NOT position:absolute/inset:0) so the parent's
  // AppWorkspaceChrome — which already reserves space for the sidebar
  // and the top header — can place us inside its main slot without our
  // iframe escaping above the header.
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0f",
      }}
    >
      {loading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9ca3af",
            fontSize: "0.9rem",
          }}
        >
          Loading billing…
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={src}
          title="Billing"
          onLoad={handleIframeLoad}
          // sandbox is intentionally loose — the iframe loads same-origin
          // content (the agent's own API) and needs wallet access via
          // window.ethereum, top-level navigation, and clipboard for the
          // copy-key flow. Locking it down breaks the dashboard.
          style={{
            flex: 1,
            border: "none",
            background: "#0a0a0f",
          }}
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}

export { BillingPageView };
export default BillingPageView;
