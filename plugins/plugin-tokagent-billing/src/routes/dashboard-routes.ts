/**
 * Dashboard routes — serve the operator-facing SPA at /v1/billing/dashboard.
 *
 * The dashboard itself is a vanilla-JS SPA migrated verbatim from
 * llm-api-gateway/dashboard. It calls the same /v1/* endpoints the billing
 * plugin already exposes (auth, credits, topup, usage, keys, price), so
 * "migration" is just static file serving plus a runtime config.js that
 * injects the current chain/app settings.
 *
 * Route layout:
 *   GET /v1/billing/dashboard          → index.html
 *   GET /v1/billing/dashboard/         → index.html (trailing-slash variant)
 *   GET /v1/billing/dashboard/index.html
 *   GET /v1/billing/dashboard/style.css
 *   GET /v1/billing/dashboard/app.js
 *   GET /v1/billing/dashboard/config.js   ← runtime-injected, NOT a file
 *
 * The index.html uses <base href="/v1/billing/dashboard/"> so relative paths
 * (style.css, app.js, config.js) resolve under the prefix.
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";

// ---------------------------------------------------------------------------
// Asset resolution
// ---------------------------------------------------------------------------

/**
 * Find the dashboard asset directory. Works for:
 *   - dev (src/dashboard/ next to this file)
 *   - bundled dist (assets copied alongside)
 *   - scaffold (file lives under tokagent/packages/billing/... — TODO if needed)
 */
function resolveDashboardDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/routes/dashboard-routes.ts → src/dashboard/
  const devCandidate = path.resolve(here, "..", "dashboard");
  if (fs.existsSync(path.join(devCandidate, "index.html"))) return devCandidate;
  // bundled dist/dashboard/
  const distCandidate = path.resolve(here, "dashboard");
  if (fs.existsSync(path.join(distCandidate, "index.html"))) return distCandidate;
  // Fallback (will produce a 500 on first request — log loudly).
  return devCandidate;
}

// Read the asset once at module load. Files are small (<60 KB total) and
// never change at runtime; reading per-request would just add disk IO.
const DASHBOARD_DIR = resolveDashboardDir();
function readAsset(name: string): string {
  return fs.readFileSync(path.join(DASHBOARD_DIR, name), "utf8");
}
const HTML = (() => {
  try { return readAsset("index.html"); }
  catch { return "<!doctype html><body>Dashboard assets missing.</body>"; }
})();
const STYLE = (() => {
  try { return readAsset("style.css"); } catch { return ""; }
})();
const APP_JS = (() => {
  try { return readAsset("app.js"); } catch { return ""; }
})();

// ---------------------------------------------------------------------------
// Runtime config injection
// ---------------------------------------------------------------------------

function buildConfigJs(runtime: IAgentRuntime): string {
  const get = (k: string): string =>
    String(process.env[k] ?? runtime.getSetting?.(k) ?? "");

  const chainId = Number(get("BILLING_CHAIN_ID")) || 1;
  const chainNames: Record<number, string> = {
    1: "Ethereum Mainnet",
    11155111: "Ethereum Sepolia",
    137: "Polygon",
    8453: "Base",
    42161: "Arbitrum One",
    10: "Optimism",
  };
  const explorers: Record<number, string> = {
    1: "https://etherscan.io",
    11155111: "https://sepolia.etherscan.io",
    137: "https://polygonscan.com",
    8453: "https://basescan.org",
    42161: "https://arbiscan.io",
    10: "https://optimistic.etherscan.io",
  };

  const config = {
    // Same-origin: the dashboard is served by the same agent API server.
    PROXY_BASE: "",
    CHAIN_ID: chainId,
    CHAIN_NAME: chainNames[chainId] ?? `chain-${chainId}`,
    CHAIN_RPC_URL: get("BILLING_CHAIN_RPC_URL"),
    CHAIN_CURRENCY_SYMBOL: "ETH",
    CHAIN_EXPLORER_URL: explorers[chainId] ?? "",
    PUBLIC_ORIGIN: "",
    APP_NAME: "Tokagent — Billing",
  };

  return (
    "// Generated at request time from billing runtime config.\n" +
    "window.__DASHBOARD_CONFIG__ = Object.freeze(" +
    JSON.stringify(config, null, 2) +
    ");\n"
  );
}

// ---------------------------------------------------------------------------
// Response helpers (route response shape varies across elizaOS plugin
// surfaces — handle Express-style and node-http-style with one helper).
// ---------------------------------------------------------------------------

/**
 * Security headers for dashboard responses. The dashboard handles wallet
 * signatures (SIWE login + EIP-3009 top-up), so we lock it down:
 *   - `default-src 'self'` blocks any third-party loads.
 *   - `frame-ancestors` allows same-origin embedding (app-companion iframes
 *     this page via `?embed=1`) but rejects cross-origin frames.
 *   - `style-src` allows inline because the page injects no <style> blocks
 *     but Bun-bundling could in future; left at 'self' 'unsafe-inline' for
 *     defensive forward-compat without weakening script execution.
 *   - `connect-src 'self'` keeps API calls same-origin (the dashboard talks
 *     to /v1/* on the same proxy that serves it).
 *   - `X-Content-Type-Options: nosniff` blocks MIME confusion.
 *   - `Referrer-Policy: no-referrer` prevents wallet operations from leaking
 *     the dashboard URL to third parties via outbound links.
 */
const DASHBOARD_SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; " +
    "img-src 'self' data:; " +
    "frame-ancestors 'self'; " +
    "base-uri 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function sendText(res: RouteResponse, status: number, contentType: string, body: string): void {
  const r = res as unknown as {
    writeHead?: (code: number, headers: Record<string, string>) => void;
    end?: (body: string) => void;
    status?: (code: number) => { send: (body: string) => void };
    send?: (body: string) => void;
    setHeader?: (k: string, v: string) => void;
  };
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    ...DASHBOARD_SECURITY_HEADERS,
  };
  if (typeof r.writeHead === "function" && typeof r.end === "function") {
    r.writeHead(status, headers);
    r.end(body);
    return;
  }
  if (typeof r.setHeader === "function" && typeof r.status === "function") {
    for (const [k, v] of Object.entries(headers)) r.setHeader(k, v);
    r.status(status).send(body);
    return;
  }
  if (typeof r.send === "function") {
    r.send(body);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// Handlers are async to match the elizaOS Route handler signature
// (`(req, res, runtime) => Promise<void>`). The bodies are synchronous —
// the `async` keyword only changes the return type, no runtime cost.
async function handleIndex(_req: RouteRequest, res: RouteResponse): Promise<void> {
  sendText(res, 200, "text/html; charset=utf-8", HTML);
}
async function handleStyle(_req: RouteRequest, res: RouteResponse): Promise<void> {
  sendText(res, 200, "text/css; charset=utf-8", STYLE);
}
async function handleAppJs(_req: RouteRequest, res: RouteResponse): Promise<void> {
  sendText(res, 200, "application/javascript; charset=utf-8", APP_JS);
}
async function handleConfigJs(
  _req: RouteRequest,
  res: RouteResponse,
  runtime: IAgentRuntime,
): Promise<void> {
  sendText(res, 200, "application/javascript; charset=utf-8", buildConfigJs(runtime));
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const dashboardRoutes: Route[] = [
  {
    type: "GET",
    path: "/v1/billing/dashboard",
    rawPath: true,
    public: true,
    name: "billing-dashboard-index",
    handler: handleIndex,
  },
  {
    type: "GET",
    path: "/v1/billing/dashboard/",
    rawPath: true,
    public: true,
    name: "billing-dashboard-index-slash",
    handler: handleIndex,
  },
  {
    type: "GET",
    path: "/v1/billing/dashboard/index.html",
    rawPath: true,
    public: true,
    name: "billing-dashboard-index-html",
    handler: handleIndex,
  },
  {
    type: "GET",
    path: "/v1/billing/dashboard/style.css",
    rawPath: true,
    public: true,
    name: "billing-dashboard-style",
    handler: handleStyle,
  },
  {
    type: "GET",
    path: "/v1/billing/dashboard/app.js",
    rawPath: true,
    public: true,
    name: "billing-dashboard-app",
    handler: handleAppJs,
  },
  {
    type: "GET",
    path: "/v1/billing/dashboard/config.js",
    rawPath: true,
    public: true,
    name: "billing-dashboard-config",
    handler: handleConfigJs,
  },
];
