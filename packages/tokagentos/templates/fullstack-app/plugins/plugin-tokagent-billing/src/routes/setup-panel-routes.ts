/**
 * Billing setup panel — server-side HTML form (Phase 9, Decision Z48 fallback).
 *
 * GET /v1/billing/setup-panel
 *
 * Returns a minimal multi-step HTML form (no framework dependencies) that
 * collects the billing configuration values and submits them to
 * POST /v1/billing/setup.
 *
 * This is the fallback UX path for environments where the companion UI's
 * side-panel mechanism is not available (e.g. headless, CLI, early onboarding).
 * In the companion UI, the frontend BillingSetupPanel.tsx component renders
 * instead (served by the Next.js app at packages/app-core).
 *
 * Decision Z48: Hybrid chat + side panel. The SETUP_BILLING action opens
 * this URL in the chat, and the user completes setup via the structured form.
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@elizaos/core";
import { generatePrivateKey, generateAuthSecret } from "../lib/billing-config-validator.js";

function setupEnabled(): boolean {
  const raw = process.env.BILLING_SETUP_ENABLED?.trim().toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "no" || raw === "off");
}

const SETUP_PANEL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Billing Setup — Tokagent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #0f0f0f; color: #e8e8e8; min-height: 100vh; padding: 2rem; }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; color: #fff; }
    .subtitle { color: #888; margin-bottom: 2rem; font-size: 0.9rem; }
    .step { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px;
            padding: 1.5rem; margin-bottom: 1rem; }
    .step-title { font-weight: 600; font-size: 1rem; margin-bottom: 1rem; color: #c8c8c8; }
    label { display: block; font-size: 0.85rem; color: #999; margin-bottom: 0.25rem; }
    input[type="text"], input[type="password"], input[type="number"], input[type="url"] {
      width: 100%; padding: 0.6rem 0.75rem; background: #111; border: 1px solid #333;
      border-radius: 6px; color: #e8e8e8; font-size: 0.9rem; font-family: monospace;
      margin-bottom: 0.75rem; }
    input:focus { outline: none; border-color: #555; }
    .hint { font-size: 0.78rem; color: #666; margin-top: -0.5rem; margin-bottom: 0.75rem; }
    .row { display: flex; gap: 0.75rem; }
    .row .field { flex: 1; }
    .btn { padding: 0.6rem 1.2rem; border: none; border-radius: 6px; cursor: pointer;
           font-size: 0.9rem; font-weight: 500; }
    .btn-secondary { background: #2a2a2a; color: #ccc; border: 1px solid #3a3a3a; }
    .btn-primary { background: #6c47ff; color: #fff; }
    .btn-primary:hover { background: #7c57ff; }
    .btn-secondary:hover { background: #333; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem; }
    #status { padding: 1rem; border-radius: 6px; margin-top: 1rem; font-size: 0.9rem;
              display: none; }
    #status.success { background: #0d2e0d; border: 1px solid #1a5e1a; color: #4caf50; }
    #status.error { background: #2e0d0d; border: 1px solid #5e1a1a; color: #f44336; }
    .field-error { font-size: 0.78rem; color: #f44336; margin-top: -0.5rem; margin-bottom: 0.75rem; }
    .key-row { display: flex; gap: 0.5rem; align-items: flex-end; margin-bottom: 0.75rem; }
    .key-row input { flex: 1; margin-bottom: 0; }
    .key-row .btn { flex-shrink: 0; height: 38px; }
    .address-display { font-size: 0.78rem; color: #888; font-family: monospace; margin-bottom: 0.75rem; }
  </style>
</head>
<body>
<div class="container">
  <h1>Billing Setup</h1>
  <p class="subtitle">Configure Web3 credit billing for your Tokagent gateway.</p>

  <form id="setup-form">
    <!-- Step 1: Database -->
    <div class="step">
      <div class="step-title">1. Database</div>
      <label for="db-url">Postgres connection string</label>
      <input type="text" id="db-url" name="databaseUrl"
             placeholder="postgres://user:pass@localhost:5432/billing" />
      <div class="hint">Use <code>pglite://./data/billing.pglite</code> for a dev/test in-process database.</div>
      <div id="db-url-error" class="field-error" style="display:none"></div>
      <button type="button" class="btn btn-secondary" onclick="testDb()">Test Connection</button>
    </div>

    <!-- Step 2: Chain -->
    <div class="step">
      <div class="step-title">2. Chain &amp; Contracts</div>
      <label for="rpc-url">Chain RPC URL</label>
      <input type="url" id="rpc-url" name="chainRpcUrl"
             placeholder="https://polygon-rpc.com" oninput="autoDetectChainId()" />
      <div class="hint">The chain where your ClaudeVault is deployed.</div>
      <div id="rpc-url-error" class="field-error" style="display:none"></div>

      <label for="chain-id">Chain ID</label>
      <input type="number" id="chain-id" name="chainId" placeholder="137" />
      <div id="chain-id-error" class="field-error" style="display:none"></div>

      <label for="vault-address">ClaudeVault address</label>
      <input type="text" id="vault-address" name="vaultAddress" placeholder="0x..." />
      <div id="vault-address-error" class="field-error" style="display:none"></div>

      <label for="pton-address">PTON token address</label>
      <input type="text" id="pton-address" name="ptonAddress" placeholder="0x..." />
      <div id="pton-address-error" class="field-error" style="display:none"></div>
      <button type="button" class="btn btn-secondary" onclick="verifyContracts()">Verify Contracts</button>
    </div>

    <!-- Step 3: Operator key -->
    <div class="step">
      <div class="step-title">3. Operator Key</div>
      <label>Operator private key</label>
      <div class="key-row">
        <input type="password" id="operator-key" name="operatorPrivateKey"
               placeholder="0x..." oninput="updateDerivedAddress()" />
        <button type="button" class="btn btn-secondary" onclick="generateKey()">Generate</button>
      </div>
      <div id="derived-address" class="address-display"></div>
      <div id="operator-key-error" class="field-error" style="display:none"></div>
      <div class="hint">The EOA that signs consume transactions on-chain. Keep this secret.</div>
    </div>

    <!-- Step 4: Auth secret -->
    <div class="step">
      <div class="step-title">4. Auth Secret</div>
      <label>HMAC auth secret (for JWT signing)</label>
      <div class="key-row">
        <input type="password" id="auth-secret" name="authSecret" placeholder="min 32 chars" />
        <button type="button" class="btn btn-secondary" onclick="generateSecret()">Generate</button>
      </div>
      <div id="auth-secret-error" class="field-error" style="display:none"></div>
    </div>

    <!-- Step 5: Optional / Review -->
    <div class="step">
      <div class="step-title">5. Optional Config</div>
      <label for="mainnet-rpc">Mainnet RPC URL (for fallback on-chain TWAP)</label>
      <input type="url" id="mainnet-rpc" name="mainnetRpcUrl"
             placeholder="https://mainnet.infura.io/v3/..." />
      <div class="hint">TON/USD is fetched live from tokamak.network/api/price. This RPC is only used as fallback if that endpoint is unreachable. Leave blank to skip the fallback.</div>
    </div>

    <div id="status"></div>

    <div class="actions">
      <button type="button" class="btn btn-secondary" onclick="validateAll()">Validate All</button>
      <button type="submit" class="btn btn-primary" id="submit-btn">Save &amp; Activate Billing</button>
    </div>
  </form>
</div>

<script>
const BASE = window.location.origin;

function showFieldError(id, msg) {
  const el = document.getElementById(id + '-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function clearErrors() {
  ['db-url','rpc-url','chain-id','vault-address','pton-address','operator-key','auth-secret']
    .forEach(id => showFieldError(id, ''));
}

function showStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = isError ? 'error' : 'success';
  el.style.display = 'block';
}

function getValues() {
  const form = document.getElementById('setup-form');
  const data = new FormData(form);
  const v = {};
  for (const [k, val] of data.entries()) { if (val) v[k] = val; }
  const chainId = parseInt(v.chainId, 10);
  if (!isNaN(chainId)) v.chainId = chainId;
  // fixedTonUsd removed from the wizard (Tokamak API is canonical). Kept
  // as a hidden admin escape hatch via BILLING_FIXED_TON_USD env var.
  delete v.fixedTonUsd;
  return v;
}

async function testDb() {
  const url = document.getElementById('db-url').value.trim();
  if (!url) { showFieldError('db-url', 'Enter a connection string first.'); return; }
  const r = await fetch(BASE + '/v1/billing/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ databaseUrl: url })
  });
  const data = await r.json();
  if (data.ok) showStatus('Database connection OK.', false);
  else showFieldError('db-url', data.errors?.databaseUrl || 'Connection failed.');
}

let chainIdDetecting = false;
async function autoDetectChainId() {
  if (chainIdDetecting) return;
  const url = document.getElementById('rpc-url').value.trim();
  if (!url) return;
  chainIdDetecting = true;
  try {
    const r = await fetch(BASE + '/v1/billing/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainRpcUrl: url })
    });
    const data = await r.json();
    if (data.ok) {
      // Chain ID auto-detection is server-side via validateChainRpcUrl
      showFieldError('rpc-url', '');
    }
  } catch {}
  chainIdDetecting = false;
}

async function verifyContracts() {
  const rpcUrl = document.getElementById('rpc-url').value.trim();
  const vaultAddress = document.getElementById('vault-address').value.trim();
  const ptonAddress = document.getElementById('pton-address').value.trim();
  if (!rpcUrl || !vaultAddress || !ptonAddress) {
    showStatus('Fill in RPC URL, vault address, and PTON address first.', true);
    return;
  }
  const r = await fetch(BASE + '/v1/billing/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainRpcUrl: rpcUrl, vaultAddress, ptonAddress })
  });
  const data = await r.json();
  if (data.ok) showStatus('Contracts verified.', false);
  else {
    if (data.errors?.vaultAddress) showFieldError('vault-address', data.errors.vaultAddress);
    if (data.errors?.chainRpcUrl) showFieldError('rpc-url', data.errors.chainRpcUrl);
  }
}

function generateKey() {
  // Generate client-side and fill the input.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
  document.getElementById('operator-key').value = '0x' + hex;
  updateDerivedAddress();
}

function generateSecret() {
  const bytes = new Uint8Array(36);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=/g,'');
  document.getElementById('auth-secret').value = b64;
}

function updateDerivedAddress() {
  // Address derivation requires secp256k1 — we show a note but can't derive in browser without a lib.
  const key = document.getElementById('operator-key').value.trim();
  const el = document.getElementById('derived-address');
  if (/^0x[0-9a-fA-F]{64}$/.test(key)) {
    el.textContent = 'Key format OK (address displayed after save)';
  } else if (key.length > 0) {
    el.textContent = 'Key must be 0x-prefixed 32-byte hex (66 chars)';
  } else {
    el.textContent = '';
  }
}

async function validateAll() {
  clearErrors();
  const values = getValues();
  const r = await fetch(BASE + '/v1/billing/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values)
  });
  const data = await r.json();
  if (data.ok) {
    showStatus('All fields validated.', false);
  } else {
    Object.entries(data.errors || {}).forEach(([field, msg]) => {
      const id = field.replace(/([A-Z])/g, c => '-' + c.toLowerCase());
      showFieldError(id, msg);
    });
    showStatus('Some fields have errors. See above.', true);
  }
}

document.getElementById('setup-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  clearErrors();
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const values = getValues();
    const r = await fetch(BASE + '/v1/billing/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    const data = await r.json();

    if (data.ok) {
      showStatus(data.message || 'Billing activated successfully.', false);
      btn.textContent = 'Billing Active';
    } else if (data.persisted && !data.restarted) {
      showStatus(data.error || 'Config saved but re-init failed. Restart the agent manually.', true);
      btn.disabled = false;
      btn.textContent = 'Save & Activate Billing';
    } else {
      if (data.errors) {
        Object.entries(data.errors).forEach(([field, msg]) => {
          const id = field.replace(/([A-Z])/g, c => '-' + c.toLowerCase());
          showFieldError(id, msg);
        });
      }
      showStatus(data.error || 'Setup failed. See field errors above.', true);
      btn.disabled = false;
      btn.textContent = 'Save & Activate Billing';
    }
  } catch (err) {
    showStatus('Network error: ' + err.message, true);
    btn.disabled = false;
    btn.textContent = 'Save & Activate Billing';
  }
});
</script>
</body>
</html>`;

async function handleSetupPanel(
  _req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!setupEnabled()) {
    res.status(403).json({ error: "Billing setup is disabled on this deployment." });
    return;
  }

  // Serve the HTML panel.
  const r = res as unknown as {
    writeHead?: (code: number, headers: Record<string, string>) => void;
    end?: (body: string) => void;
    status?: (code: number) => { send: (body: string) => void };
    send?: (body: string) => void;
  };

  if (typeof r.writeHead === "function" && typeof r.end === "function") {
    r.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    r.end(SETUP_PANEL_HTML);
  } else if (typeof r.status === "function") {
    r.status(200).send(SETUP_PANEL_HTML);
  } else if (typeof r.send === "function") {
    r.send(SETUP_PANEL_HTML);
  }
}

export const setupPanelRoutes: Route[] = [
  {
    type: "GET",
    path: "/v1/billing/setup-panel",
    rawPath: true,
    public: true,
    name: "billing-setup-panel",
    handler: handleSetupPanel,
  },
];
