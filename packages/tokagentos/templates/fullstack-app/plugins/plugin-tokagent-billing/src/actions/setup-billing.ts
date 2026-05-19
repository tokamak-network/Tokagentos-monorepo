/**
 * SETUP_BILLING conversational action (Phase 9, v2.0.7 Railway-hosted-first).
 *
 * Triggered when the user asks the agent to "set up billing", "enable billing",
 * "configure payments", etc. The handler:
 *   1. Checks if billing is already initialized and asks to confirm reconfigure.
 *   2. By default replies with the client-mode (Railway-hosted gateway) story —
 *      the new default in v2.0.7. Mentions the Railway URL and the setup panel.
 *   3. If the user says "self-host" or "server-mode", branches to the 5-item
 *      self-hosted wizard (Postgres, RPC, vault, PTON, operator key).
 *   4. If the user mentions "gateway URL", "client mode", or pastes an
 *      http(s):// URL, branches to the focused single-URL client-mode reply.
 *
 * Decision Z48: hybrid chat + side panel. The action responds with a short
 * message and a link to the setup panel. The panel itself is served at
 * GET /v1/billing/setup-panel (a static HTML form) for environments where the
 * companion UI's panel mechanism is not available.
 *
 * Decision Z46: the action is always available (validate() always returns true
 * for matching messages) regardless of BILLING_ENABLED so the setup conversation
 * is reachable before billing is configured.
 */

import type { Action, Content, HandlerCallback, IAgentRuntime, Memory, State } from "@elizaos/core";
import { isBillingStateInitialized } from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesBillingIntent(text: string): boolean {
  return /\b(billing|payments?|credits?|top[- ]?up|enable billing|set up billing|configure billing|web3 payments?|gateway url|client mode|https?:\/\/)\b/i.test(
    text,
  );
}

/**
 * Detect whether the user wants to self-host (server-mode). Triggers on
 * explicit phrasing ("self-host", "server mode", "my own billing server",
 * "run billing myself", "own billing", etc.).
 * v2.0.7: server-mode is no longer the default; it is the opt-in path.
 */
function looksLikeServerModeIntent(text: string): boolean {
  if (/self[\s-]?host/i.test(text)) return true;
  if (/server[\s-]?mode/i.test(text)) return true;
  if (/my own billing/i.test(text)) return true;
  if (/run.*billing.*myself/i.test(text)) return true;
  if (/own billing server/i.test(text)) return true;
  if (/host.*billing/i.test(text)) return true;
  return false;
}

/**
 * Detect whether the user explicitly wants to configure client-mode with
 * a specific gateway URL (not the Railway default). Triggers on explicit
 * phrasing ("gateway URL", "client mode") OR on the presence of an
 * http(s):// URL in the message — the user likely pasted their operator's URL.
 */
function looksLikeClientModeIntent(text: string): boolean {
  if (/gateway\s*url/i.test(text)) return true;
  if (/client[\s-]?mode/i.test(text)) return true;
  if (/https?:\/\/\S+/i.test(text)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Action definition
// ---------------------------------------------------------------------------

export const setupBillingAction: Action = {
  name: "SETUP_BILLING",
  similes: [
    "set up billing",
    "enable billing",
    "configure web3 payments",
    "configure billing",
    "setup billing",
    "activate billing",
    "turn on billing",
  ],
  description:
    "Walks the user through configuring Web3 billing (PTON credits, chain wiring, auth). " +
    "Opens the billing setup panel or provides inline setup instructions.",

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
  ): Promise<boolean> => {
    // Available for any billing-related message, whether billing is already
    // configured or not (Z46: always reachable for setup conversation).
    const text = message.content?.text ?? "";
    return matchesBillingIntent(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<undefined> => {
    const alreadyInitialized = isBillingStateInitialized();

    if (alreadyInitialized) {
      // Billing is already running — offer to reconfigure.
      await callback?.({
        text:
          "Billing is already active on this agent. To reconfigure it, open the billing setup panel at `/v1/billing/setup-panel` in your browser, or POST to `/v1/billing/setup` with updated values.\n\n" +
          "⚠️  Reconfiguring will restart the billing plugin. Any in-flight consume cycles will be interrupted.",
        action: "SETUP_BILLING",
      } as Content);
      return undefined;
    }

    // Billing is not yet configured — point the user at the setup panel.
    // The panel is served by the agent's API server. In dev mode `dev-ui.mjs`
    // boots the API on port 31337 (DEFAULT_API_PORT in scaffolds), with
    // ELIZA_API_PORT exported into the process env. Older field name was
    // SERVER_PORT — checked last for backwards compat.
    const port =
      runtime.getSetting?.("ELIZA_API_PORT") ??
      runtime.getSetting?.("API_PORT") ??
      runtime.getSetting?.("SERVER_PORT") ??
      "31337";
    const setupPanelUrl = `http://localhost:${port}/v1/billing/setup-panel`;

    // Branch on user intent.
    // v2.0.7: default is client-mode (Railway-hosted gateway).
    // Server-mode (self-host) is the opt-in path, reachable by saying "self-host".
    const text = message.content?.text ?? "";
    const RAILWAY_URL = "https://billing-service-production-a8e7.up.railway.app";

    if (looksLikeServerModeIntent(text)) {
      // User wants to self-host — give them the 5-item server-mode wizard.
      await callback?.({
        text:
          `[Click here to open the billing setup panel](${setupPanelUrl})\n\n` +
          `If the link doesn't open, copy it into your browser: ${setupPanelUrl}\n\n` +
          "**Self-hosted (server-mode) setup** — you'll need:\n" +
          "1. A Postgres connection string (any Postgres 14+ — local Docker, Supabase, Railway, RDS, your own server)\n" +
          "2. Your chain RPC URL (Ethereum mainnet — free public endpoints like `https://eth.llamarpc.com` work)\n" +
          "3. Your deployed ClaudeVault contract address (use the mainnet default or your own deploy)\n" +
          "4. Your deployed PTON token address (use the mainnet default or your own deploy)\n" +
          "5. An operator Ethereum private key (or click Generate in the panel — needs ~0.1 ETH for gas)\n\n" +
          "The wizard also generates the HMAC auth secret for you. " +
          "Once you submit the form, the billing plugin initializes automatically — " +
          "no manual restart needed.",
        action: "SETUP_BILLING",
      } as Content);
      return undefined;
    }

    if (looksLikeClientModeIntent(text)) {
      // User explicitly mentions a custom gateway URL or client-mode.
      await callback?.({
        text:
          "Client-mode setup: you connect to an existing tokagent-billing-server " +
          "run by an operator.\n\n" +
          "**Default upstream**: `" + RAILWAY_URL + "` (the Tokamak-hosted Railway billing server).\n\n" +
          "To use a custom gateway, set `BILLING_MODE=client` and " +
          "`TOKAGENT_GATEWAY_URL=<your-operator-url>` in your `.env`.\n\n" +
          `Or open the setup panel at ${setupPanelUrl} and expand the ` +
          "**Already a client of a hosted billing server?** disclosure at the bottom — " +
          "submitting it persists `BILLING_MODE=client` + `TOKAGENT_GATEWAY_URL` to your `.env`.",
        action: "SETUP_BILLING",
      } as Content);
      return undefined;
    }

    // Default: client-mode (Railway-hosted gateway). v2.0.7 — the out-of-the-box
    // experience connects to the Tokamak Railway billing server automatically.
    await callback?.({
      text:
        `[Click here to open the billing setup panel](${setupPanelUrl})\n\n` +
        `If the link doesn't open, copy it into your browser: ${setupPanelUrl}\n\n` +
        "**Billing is pre-configured to connect to the Tokamak-hosted gateway at:**\n" +
        "`" + RAILWAY_URL + "`\n\n" +
        "No local database or chain configuration needed — the Railway billing server handles " +
        "on-chain settlement, credit storage, and PTON accounting on your behalf.\n\n" +
        "To get started: open the setup panel above and connect your wallet to mint API keys.\n\n" +
        "Want to self-host your own billing server instead? Say \"I want to self-host\" " +
        "and I'll walk you through the server-mode setup.",
      action: "SETUP_BILLING",
    } as Content);
    return undefined;
  },

  examples: [
    [
      { name: "user", content: { text: "set up billing" } },
      {
        name: "agent",
        content: {
          text: "Opening billing setup...",
          actions: ["SETUP_BILLING"],
        },
      },
    ],
    [
      { name: "user", content: { text: "I want to enable web3 payments for my agent" } },
      {
        name: "agent",
        content: {
          text: "Opening billing setup... You will need a ClaudeVault address and PTON address.",
          actions: ["SETUP_BILLING"],
        },
      },
    ],
    [
      { name: "user", content: { text: "how do I configure billing?" } },
      {
        name: "agent",
        content: {
          text: "Opening billing setup...",
          actions: ["SETUP_BILLING"],
        },
      },
    ],
  ],
};
