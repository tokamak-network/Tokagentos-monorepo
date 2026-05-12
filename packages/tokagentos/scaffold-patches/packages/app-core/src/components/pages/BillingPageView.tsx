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
 */

import { useEffect, useState } from "react";

function BillingPageView(): React.ReactElement {
  // Pick the dashboard if billing is configured, the setup wizard if not.
  // Both URLs go through the Vite dev proxy (/v1/* → agent API on 31337).
  const [src, setSrc] = useState<string>("/v1/billing/dashboard");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/v1/billing/status")
      .then((res) => (res.ok ? (res.json() as Promise<{ enabled: boolean }>) : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setSrc(
          json.enabled === true
            ? "/v1/billing/dashboard"
            : "/v1/billing/setup-panel",
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Plugin unreachable — default to setup-panel so the user has an
        // entry point even if the agent is mid-boot.
        setSrc("/v1/billing/setup-panel");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0f0f0f",
      }}
    >
      {loading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#888",
            fontSize: "0.9rem",
          }}
        >
          Loading billing…
        </div>
      ) : (
        <iframe
          src={src}
          title="Billing"
          // sandbox is intentionally loose — the iframe loads same-origin
          // content (the agent's own API) and needs wallet access via
          // window.ethereum, top-level navigation, and clipboard for the
          // copy-key flow. Locking it down breaks the dashboard.
          style={{
            flex: 1,
            border: "none",
            background: "#05070d",
          }}
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}

export { BillingPageView };
export default BillingPageView;
