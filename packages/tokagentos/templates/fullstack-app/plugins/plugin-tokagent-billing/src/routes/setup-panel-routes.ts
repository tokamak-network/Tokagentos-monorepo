/**
 * Billing setup panel — server-side HTML form (Phase 9, Decision Z48 fallback,
 * v2.0.7 Railway-hosted-first redesign).
 *
 * GET /v1/billing/setup-panel
 *
 * Default view: calm hero "Connected to Tokamak billing gateway" showing the
 * Railway URL (https://billing-service-production-a8e7.up.railway.app). Users
 * can connect their wallet to mint API keys immediately.
 *
 * The 7-field self-hosted server-mode setup form is behind a native <details>
 * "Advanced: self-host your own billing server" disclosure at the bottom. It
 * includes inline help text for each field (Docker Postgres one-liner, public
 * RPC URLs, canonical mainnet addresses, `cast wallet new`, `openssl rand -hex 32`).
 *
 * This reverses the v2.0.5 self-hosted-first layout: gateway story is now
 * front-and-center; self-hosting is the advanced opt-in path.
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@elizaos/core";

function setupEnabled(): boolean {
  const raw = process.env.BILLING_SETUP_ENABLED?.trim().toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "no" || raw === "off");
}

const RAILWAY_URL = "https://billing-service-production-a8e7.up.railway.app";

const SETUP_PANEL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>x402 billing — Tokagent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #0f0f0f; color: #e8e8e8; min-height: 100vh; padding: 2rem; }
    .container { max-width: 720px; margin: 0 auto; }
    /* Hero */
    .hero { background: #0d1f0d; border: 1px solid #1a5e1a; border-radius: 10px;
            padding: 1.75rem; margin-bottom: 1.5rem; }
    .hero-badge { display: inline-flex; align-items: center; gap: 0.4rem;
                  background: #1a5e1a; color: #4caf50; border-radius: 20px;
                  padding: 0.2rem 0.75rem; font-size: 0.8rem; font-weight: 600;
                  margin-bottom: 0.9rem; }
    .hero-badge::before { content: "●"; font-size: 0.5rem; }
    h1.page-title { font-size: 1.4rem; font-weight: 600; color: #fff;
                    margin-bottom: 0.5rem; }
    .hero-url { font-family: monospace; font-size: 0.88rem; color: #4caf50;
                background: #0a0a0a; padding: 0.35rem 0.6rem; border-radius: 5px;
                display: inline-block; margin-bottom: 0.9rem; word-break: break-all; }
    p.hero-desc { color: #aaa; font-size: 0.9rem; line-height: 1.55; }
    /* Client URL form */
    .client-section { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px;
                      padding: 1.25rem; margin-bottom: 1rem; }
    .client-section h2 { font-size: 0.95rem; font-weight: 600; color: #c8c8c8;
                          margin-bottom: 0.75rem; }
    label { display: block; font-size: 0.85rem; color: #c8c8c8; margin-bottom: 0.25rem; }
    input[type="text"], input[type="password"], input[type="number"], input[type="url"] {
      width: 100%; padding: 0.6rem 0.75rem; background: #0a0a0a; border: 1px solid #333;
      border-radius: 6px; color: #e8e8e8; font-size: 0.9rem; font-family: monospace;
      margin-bottom: 0.4rem; }
    input:focus { outline: none; border-color: #555; }
    small.hint { display: block; font-size: 0.78rem; color: #888; line-height: 1.5;
                 margin-top: 0.1rem; margin-bottom: 0.75rem; white-space: pre-wrap; }
    small.hint code { background: #0a0a0a; padding: 0.05rem 0.35rem; border-radius: 3px;
                      color: #d8d8d8; font-size: 0.78rem; }
    .btn { padding: 0.6rem 1.2rem; border: none; border-radius: 6px; cursor: pointer;
           font-size: 0.9rem; font-weight: 500; }
    .btn-secondary { background: #2a2a2a; color: #ccc; border: 1px solid #3a3a3a; }
    .btn-primary { background: #6c47ff; color: #fff; }
    .btn-primary:hover { background: #7c57ff; }
    .btn-secondary:hover { background: #333; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.25rem; }
    .toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    #status { padding: 1rem; border-radius: 6px; margin-top: 1rem; font-size: 0.9rem;
              display: none; }
    #status.success { background: #0d2e0d; border: 1px solid #1a5e1a; color: #4caf50; }
    #status.error { background: #2e0d0d; border: 1px solid #5e1a1a; color: #f44336; }
    .field-error { font-size: 0.78rem; color: #f44336; margin-top: -0.5rem; margin-bottom: 0.75rem; }
    .key-row { display: flex; gap: 0.5rem; align-items: flex-end; margin-bottom: 0.4rem; }
    .key-row input { flex: 1; margin-bottom: 0; }
    .key-row .btn { flex-shrink: 0; height: 38px; }
    .address-display { font-size: 0.78rem; color: #888; font-family: monospace; margin-bottom: 0.75rem; }
    /* Form steps */
    .step { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px;
            padding: 1.25rem; margin-bottom: 0.75rem; }
    .step-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.75rem; color: #c8c8c8; }
    /* Self-host disclosure */
    .divider { height: 1px; background: #2a2a2a; margin: 2rem 0 1rem; }
    details.self-host { background: #141414; border: 1px solid #2a2a2a;
                        border-radius: 8px; padding: 0; overflow: hidden;
                        margin-top: 0.5rem; }
    details.self-host > summary {
      cursor: pointer; padding: 0.9rem 1.25rem; user-select: none;
      color: #c8c8c8; font-size: 0.9rem; font-weight: 500;
      list-style: none; display: flex; align-items: center; gap: 0.5rem;
    }
    details.self-host > summary::-webkit-details-marker { display: none; }
    details.self-host > summary::before {
      content: "▸"; font-size: 0.75rem; transition: transform 0.15s;
      display: inline-block; color: #666;
    }
    details.self-host[open] > summary::before { transform: rotate(90deg); }
    details.self-host > summary:hover { color: #fff; background: #1a1a1a; }
    .self-host-body { padding: 0 1.25rem 1.25rem; }
  </style>
</head>
<body>
<div class="container">

  <!-- Hero: Connected to Tokamak billing gateway -->
  <div class="hero">
    <div class="hero-badge">Connected to Tokamak billing gateway</div>
    <h1 class="page-title">x402 billing — ready to use</h1>
    <div class="hero-url">${RAILWAY_URL}</div>
    <p class="hero-desc">
      Your agent is configured to use the Tokamak-hosted billing server on Railway.
      No local database or chain setup required — the gateway handles on-chain settlement,
      credit storage, and PTON accounting. Connect your wallet below to mint API keys
      and start billing.
    </p>
  </div>

  <!-- Client-mode URL override -->
  <div class="client-section">
    <h2>Gateway URL</h2>
    <label for="gateway-url">Use a custom gateway URL (optional)</label>
    <input type="url" id="gateway-url" name="gatewayUrl"
           placeholder="${RAILWAY_URL}" />
    <small class="hint">Leave blank to use the default Tokamak Railway gateway above.
Override only if your operator gave you a different billing server URL.
Saving this persists <code>TOKAGENT_GATEWAY_URL</code> to your <code>.env</code>.</small>
    <div id="gateway-url-error" class="field-error" style="display:none"></div>
    <div class="actions">
      <button type="button" class="btn btn-primary" id="client-submit-btn"
              onclick="saveClientConfig()">Save gateway URL</button>
    </div>
  </div>

  <div id="status"></div>

  <div class="divider"></div>

  <!-- Self-host disclosure (advanced) -->
  <details class="self-host" id="self-host-disclosure">
    <summary>Advanced: self-host your own billing server →</summary>
    <div class="self-host-body">
      <p style="color:#888;font-size:0.85rem;margin:0.75rem 0 1rem;">
        Run your own billing server backed by Postgres + an on-chain operator EOA.
        You'll need 7 things: a Postgres database, a chain RPC, ClaudeVault address,
        PTON address, an operator private key, an auth secret, and optionally a
        mainnet RPC for the TWAP oracle.
      </p>

      <div class="toolbar">
        <button type="button" class="btn btn-secondary" onclick="fillMainnetDefaults()">Use mainnet defaults</button>
      </div>

      <form id="setup-form">
        <!-- 1. Database -->
        <div class="step">
          <div class="step-title">1. Database</div>
          <label for="db-url">Postgres connection string</label>
          <input type="text" id="db-url" name="databaseUrl"
                 placeholder="postgresql://postgres:postgres@localhost:5432/postgres" />
          <small class="hint">Any Postgres 14+ works. Quickest local setup:
<code>docker run -d --name tokagent-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16</code>
Then use: <code>postgresql://postgres:postgres@localhost:5432/postgres</code>
Or use any managed Postgres (Supabase, Railway, AWS RDS, your own server). The schema migrations run automatically on first boot.</small>
          <div id="db-url-error" class="field-error" style="display:none"></div>
          <button type="button" class="btn btn-secondary" onclick="testDb()">Test Connection</button>
        </div>

        <!-- 2. Chain RPC URL -->
        <div class="step">
          <div class="step-title">2. Chain RPC URL</div>
          <label for="rpc-url">Chain RPC URL</label>
          <input type="url" id="rpc-url" name="chainRpcUrl"
                 placeholder="https://eth.llamarpc.com" oninput="autoDetectChainId()" />
          <small class="hint">Ethereum mainnet RPC. Used to send <code>vault.consumeCredits</code> transactions.
Free public endpoints: <code>https://eth.llamarpc.com</code>  |  <code>https://rpc.ankr.com/eth</code>  |  <code>https://ethereum.publicnode.com</code>
Production: get an Alchemy or Infura API key for higher reliability and rate limits.</small>
          <div id="rpc-url-error" class="field-error" style="display:none"></div>
        </div>

        <!-- 3. Chain ID -->
        <div class="step">
          <div class="step-title">3. Chain ID</div>
          <label for="chain-id">Chain ID</label>
          <input type="number" id="chain-id" name="chainId" placeholder="1" />
          <small class="hint">Auto-detected from the RPC URL. <code>1</code> = Ethereum mainnet. The default PTON + ClaudeVault addresses below are on mainnet.</small>
          <div id="chain-id-error" class="field-error" style="display:none"></div>
        </div>

        <!-- 4. ClaudeVault address -->
        <div class="step">
          <div class="step-title">4. ClaudeVault address</div>
          <label for="vault-address">ClaudeVault address</label>
          <input type="text" id="vault-address" name="vaultAddress" placeholder="0x..." />
          <small class="hint">Mainnet (live): <code>0x1072f70e7c490E460fA72AC4171F7aDD1ef2d79F</code>
For your own testnet/private deploy: see <code>llm-api-gateway/contracts/src/ClaudeVault.sol</code> — deploy with foundry, then paste the deployed address here. Your operator EOA below must hold <code>OPERATOR_ROLE</code> on this contract.</small>
          <div id="vault-address-error" class="field-error" style="display:none"></div>
        </div>

        <!-- 5. PTON address -->
        <div class="step">
          <div class="step-title">5. PTON address</div>
          <label for="pton-address">PTON token address</label>
          <input type="text" id="pton-address" name="ptonAddress" placeholder="0x..." />
          <small class="hint">Mainnet (live): <code>0x00D1EDcE8E7c617891FF76224DFf501c568f1Ce0</code>
PTON wraps Tokamak TON 1:1 and supports EIP-3009 for gasless x402 payments. Users wrap TON to PTON, then deposit PTON into ClaudeVault to fund their billing balance.</small>
          <div id="pton-address-error" class="field-error" style="display:none"></div>
          <button type="button" class="btn btn-secondary" onclick="verifyContracts()">Verify Contracts</button>
        </div>

        <!-- 6. Operator private key -->
        <div class="step">
          <div class="step-title">6. Operator private key</div>
          <label for="operator-key">Operator private key</label>
          <div class="key-row">
            <input type="password" id="operator-key" name="operatorPrivateKey"
                   placeholder="0x..." oninput="updateDerivedAddress()" />
            <button type="button" class="btn btn-secondary" onclick="generateKey()">Generate</button>
          </div>
          <small class="hint">EOA that calls <code>vault.consumeCredits()</code> to settle user credits on-chain.
Generate a fresh key: <code>cast wallet new</code>
Fund the address with ~0.1 ETH for gas (caps blast radius if leaked).
Grant <code>OPERATOR_ROLE</code> on ClaudeVault from your admin account.
WARNING: never paste a wallet with significant balance. This is a hot key on whatever machine runs this server.</small>
          <div id="derived-address" class="address-display"></div>
          <div id="operator-key-error" class="field-error" style="display:none"></div>
        </div>

        <!-- 7. Auth secret -->
        <div class="step">
          <div class="step-title">7. Auth secret</div>
          <label for="auth-secret">HMAC auth secret</label>
          <div class="key-row">
            <input type="password" id="auth-secret" name="authSecret" placeholder="min 32 chars" />
            <button type="button" class="btn btn-secondary" onclick="generateSecret()">Generate</button>
          </div>
          <small class="hint">Random 32-byte hex. Used to sign JWTs and HMAC <code>sk-ai-*</code> API keys.
Generate: <code>openssl rand -hex 32</code>
Click "Generate" above to fill automatically. Rotating this invalidates all sessions AND all API keys — users must re-login and re-mint keys.</small>
          <div id="auth-secret-error" class="field-error" style="display:none"></div>
        </div>

        <!-- 8. Optional mainnet RPC -->
        <div class="step">
          <div class="step-title">Optional: Mainnet RPC</div>
          <label for="mainnet-rpc">Mainnet RPC URL (optional)</label>
          <input type="url" id="mainnet-rpc" name="mainnetRpcUrl"
                 placeholder="https://eth.llamarpc.com" />
          <small class="hint">Defaults to your chain RPC above. Used to query Uniswap V3 for live TON/USD pricing (TWAP oracle). Can be a different provider — useful if your chain RPC has tight rate limits and you want to isolate the TWAP polling load.</small>
        </div>

        <div class="actions">
          <button type="button" class="btn btn-secondary" onclick="validateAll()">Validate All</button>
          <button type="submit" class="btn btn-primary" id="submit-btn">Save self-hosted config</button>
        </div>
      </form>
    </div>
  </details>
</div>

<script>
const BASE = window.location.origin;

// ── Mainnet defaults helper ─────────────────────────────────────────────────
function fillMainnetDefaults() {
  document.getElementById('vault-address').value = '0x1072f70e7c490E460fA72AC4171F7aDD1ef2d79F';
  document.getElementById('pton-address').value = '0x00D1EDcE8E7c617891FF76224DFf501c568f1Ce0';
  document.getElementById('chain-id').value = '1';
}

// ── Self-hosted form submit ─────────────────────────────────────────────────
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

// ── Client gateway URL save ─────────────────────────────────────────────────
async function saveClientConfig() {
  showFieldError('gateway-url', '');
  const btn = document.getElementById('client-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const url = document.getElementById('gateway-url').value.trim();
    const r = await fetch(BASE + '/v1/billing/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billingMode: 'client', gatewayUrl: url || undefined })
    });
    const data = await r.json();
    if (data.ok) {
      showStatus(data.message || 'Gateway URL saved.', false);
      btn.textContent = 'Saved';
    } else {
      showFieldError('gateway-url', data.error || 'Could not save gateway URL.');
      btn.disabled = false;
      btn.textContent = 'Save gateway URL';
    }
  } catch (err) {
    showStatus('Network error: ' + err.message, true);
    btn.disabled = false;
    btn.textContent = 'Save gateway URL';
  }
}

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
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
  document.getElementById('operator-key').value = '0x' + hex;
  updateDerivedAddress();
}

function generateSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
  document.getElementById('auth-secret').value = hex;
}

function updateDerivedAddress() {
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
// v2.0.5: the panel is the same in both modes — the default-visible form is
// the 7-field self-hosted setup, and the client-mode disclosure handles the
// "I've been given a gateway URL" case. Both modes return `setupPanelRoutes`.
export function getSetupPanelRoutes(_mode: "server" | "client"): Route[] {
  return setupPanelRoutes;
}
