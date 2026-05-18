/**
 * Billing setup panel — server-side HTML form (Phase 9, Decision Z48 fallback,
 * v2.1.0 mode-picker redesign).
 *
 * GET /v1/billing/setup-panel
 *
 * Returns a calm "Connected to Tokagent gateway" hero by default — the
 * happy path for a fresh tokagentos install that's already pointing at the
 * hosted gateway. A native <details> disclosure reveals the original 7-field
 * server-mode form for operators who want to self-host the billing server.
 *
 * The default view is intentionally quiet: no warnings, no form fields, no
 * scary configuration prompts. The user only sees the self-host form if they
 * explicitly open the disclosure.
 *
 * This is the fallback UX path for environments where the companion UI's
 * side-panel mechanism is not available (e.g. headless, CLI, early onboarding).
 *
 * Decision Z48: Hybrid chat + side panel. The SETUP_BILLING action opens
 * this URL in the chat, and the user either clicks "Connect wallet" (default)
 * or opens the advanced disclosure to self-host.
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";

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
    /* Hero (default view) */
    .hero { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px;
            padding: 2rem; margin-bottom: 1rem; }
    .hero-mark { font-size: 0.85rem; color: #4caf50; font-weight: 600;
                 letter-spacing: 0.02em; margin-bottom: 0.75rem; }
    .hero-title { font-size: 1.5rem; font-weight: 600; color: #fff;
                  margin-bottom: 0.75rem; }
    .hero-copy { color: #aaa; font-size: 0.95rem; line-height: 1.5;
                 margin-bottom: 1.5rem; }
    .hero-copy code { background: #111; padding: 0.1rem 0.4rem;
                      border-radius: 4px; font-size: 0.85rem; color: #c8c8c8; }
    .cta-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    a.btn-cta { display: inline-block; padding: 0.7rem 1.4rem; border-radius: 6px;
                background: #6c47ff; color: #fff; text-decoration: none;
                font-size: 0.95rem; font-weight: 500; transition: background 0.15s; }
    a.btn-cta:hover { background: #7c57ff; }
    /* Divider + disclosure */
    .divider { height: 1px; background: #2a2a2a; margin: 1.5rem 0; }
    .disclosure-label { color: #888; font-size: 0.9rem; margin-bottom: 0.5rem; }
    details.advanced { background: #1a1a1a; border: 1px solid #2a2a2a;
                       border-radius: 8px; padding: 0; overflow: hidden; }
    details.advanced > summary {
      cursor: pointer; padding: 1rem 1.5rem; user-select: none;
      color: #c8c8c8; font-size: 0.95rem; font-weight: 500;
      list-style: none; display: flex; align-items: center; gap: 0.5rem;
    }
    details.advanced > summary::-webkit-details-marker { display: none; }
    details.advanced > summary::before {
      content: "▸"; font-size: 0.75rem; transition: transform 0.15s;
      display: inline-block; color: #666;
    }
    details.advanced[open] > summary::before { transform: rotate(90deg); }
    details.advanced > summary:hover { color: #fff; background: #1f1f1f; }
    .advanced-body { padding: 0 1.5rem 1.5rem; }
    .advanced-intro { color: #888; font-size: 0.88rem; line-height: 1.5;
                      margin-bottom: 1.25rem; padding-top: 0.5rem; }
    /* Form (revealed under disclosure) */
    .step { background: #111; border: 1px solid #2a2a2a; border-radius: 8px;
            padding: 1.25rem; margin-bottom: 0.75rem; }
    .step-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 1rem; color: #c8c8c8; }
    label { display: block; font-size: 0.85rem; color: #999; margin-bottom: 0.25rem; }
    input[type="text"], input[type="password"], input[type="number"], input[type="url"] {
      width: 100%; padding: 0.6rem 0.75rem; background: #0a0a0a; border: 1px solid #333;
      border-radius: 6px; color: #e8e8e8; font-size: 0.9rem; font-family: monospace;
      margin-bottom: 0.75rem; }
    input:focus { outline: none; border-color: #555; }
    .hint { font-size: 0.78rem; color: #666; margin-top: -0.5rem; margin-bottom: 0.75rem; }
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
  <!-- Default view: hero showing the agent is already wired to the hosted gateway. -->
  <section class="hero" aria-label="Billing status">
    <div class="hero-mark">✓ Connected to Tokagent gateway</div>
    <h1 class="hero-title">You're already set up.</h1>
    <p class="hero-copy">
      This Tokagent CLI uses the hosted billing rail at
      <code>gateway.tokagent.ai</code>. You don't need to configure anything —
      just connect your wallet to start.
    </p>
    <div class="cta-row">
      <a class="btn-cta" href="/v1/billing/dashboard/">Connect wallet →</a>
    </div>
  </section>

  <div class="divider"></div>

  <div class="disclosure-label">Want to run your own billing server?</div>

  <details class="advanced" id="advanced-self-host">
    <summary>Advanced: self-host billing</summary>
    <div class="advanced-body">
      <p class="advanced-intro">
        Self-hosting means you provide your own Postgres database, operator
        wallet, and ClaudeVault deployment. The CLI will use your local server
        instead of the hosted gateway. You're responsible for funding the
        operator EOA.
      </p>

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
          <button type="submit" class="btn btn-primary" id="submit-btn">Save self-hosted config</button>
        </div>
      </form>
    </div>
  </details>
</div>

<script>
// The advanced form scripts are guarded: they only run when the user opens
// the disclosure. We attach the form-submit listener and helper functions
// lazily on first reveal so the default view never executes form logic.
let advancedInit = false;

function initAdvancedForm() {
  if (advancedInit) return;
  if (!document.getElementById('setup-form')) return;
  advancedInit = true;

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
        showStatus(data.message || 'Self-hosted billing saved successfully.', false);
        btn.textContent = 'Saved';
      } else if (data.persisted && !data.restarted) {
        showStatus(data.error || 'Config saved but re-init failed. Restart the agent manually.', true);
        btn.disabled = false;
        btn.textContent = 'Save self-hosted config';
      } else {
        if (data.errors) {
          Object.entries(data.errors).forEach(([field, msg]) => {
            const id = field.replace(/([A-Z])/g, c => '-' + c.toLowerCase());
            showFieldError(id, msg);
          });
        }
        showStatus(data.error || 'Setup failed. See field errors above.', true);
        btn.disabled = false;
        btn.textContent = 'Save self-hosted config';
      }
    } catch (err) {
      showStatus('Network error: ' + err.message, true);
      btn.disabled = false;
      btn.textContent = 'Save self-hosted config';
    }
  });
}

// Lazy-initialize on first disclosure open so the default view stays pristine.
const advancedDetails = document.getElementById('advanced-self-host');
if (advancedDetails) {
  advancedDetails.addEventListener('toggle', () => {
    if (advancedDetails.open) initAdvancedForm();
  });
}

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
  if (!el) return;
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

// ---------------------------------------------------------------------------
// Mode-aware factory
// ---------------------------------------------------------------------------
//
// v2.1.0: with TOKAGENT_GATEWAY_URL now defaulted, the client-mode panel and
// the server-mode panel collapse into the SAME panel — the mode-picker hero.
// The client-mode-specific gateway-URL form is gone (the URL has a sensible
// default; advanced users edit it via env var or a future admin UI). Both
// modes return `setupPanelRoutes` so the panel UX is identical regardless
// of which mode the plugin booted in.
export function getSetupPanelRoutes(_mode: "server" | "client"): Route[] {
  return setupPanelRoutes;
}
