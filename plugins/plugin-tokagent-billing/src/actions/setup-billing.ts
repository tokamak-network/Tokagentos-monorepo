/**
 * SETUP_BILLING conversational action (Phase 9, v2.0.5 self-hosted-first).
 *
 * Triggered when the user asks the agent to "set up billing", "enable billing",
 * "configure payments", etc. The handler:
 *   1. Checks if billing is already initialized and asks to confirm reconfigure.
 *   2. By default replies with the server-mode (self-hosted) prompt sequence
 *      pointing at the setup panel, listing the 5 things the user needs.
 *   3. If the user mentions "gateway URL", "client mode", or pastes an
 *      http(s):// URL, branches to a single-question client-mode flow that
 *      persists BILLING_MODE=client + TOKAGENT_GATEWAY_URL.
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

import type { Action, Content, HandlerCallback, IAgentRuntime, Memory, State } from "@tokagentos/core";
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
 * Detect whether the user wants to switch to client-mode. Triggers on
 * explicit phrasing ("gateway URL", "client mode") OR on the presence of
 * an http(s):// URL in the message — the user likely pasted the URL their
 * operator gave them.
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

    // Branch on user intent. If the user has signalled client-mode (pasted a
    // URL or mentioned "gateway URL" / "client mode"), give them the short
    // single-question prompt. Otherwise default to the server-mode self-host
    // wizard.
    const text = message.content?.text ?? "";
    if (looksLikeClientModeIntent(text)) {
      await callback?.({
        text:
          "Client-mode setup: you connect to an existing tokagent-billing-server " +
          "run by someone else.\n\n" +
          "What gateway URL did your operator give you? Paste it as " +
          "`https://billing.example.com` (the HTTPS URL of the server).\n\n" +
          `Or open the setup panel at ${setupPanelUrl} and expand the ` +
          "**Already a client of a hosted billing server?** disclosure at the bottom — " +
          "submitting it persists `BILLING_MODE=client` + `TOKAGENT_GATEWAY_URL` to your `.env`.",
        action: "SETUP_BILLING",
      } as Content);
      return undefined;
    }

    // Default: server-mode (self-hosted) setup. Tokagent billing is
    // self-hosted only — every operator runs their own billing server.
    await callback?.({
      text:
        `[Click here to open the billing setup panel](${setupPanelUrl})\n\n` +
        `If the link doesn't open, copy it into your browser: ${setupPanelUrl}\n\n` +
        "You'll need:\n" +
        "1. A Postgres connection string (any Postgres 14+ — local Docker, Supabase, Railway, RDS, your own server)\n" +
        "2. Your chain RPC URL (Ethereum mainnet — free public endpoints like `https://eth.llamarpc.com` work)\n" +
        "3. Your deployed ClaudeVault contract address (use the mainnet default or your own deploy)\n" +
        "4. Your deployed PTON token address (use the mainnet default or your own deploy)\n" +
        "5. An operator Ethereum private key (or click Generate in the panel — needs ~0.1 ETH for gas)\n\n" +
        "The wizard also generates the HMAC auth secret for you. " +
        "Once you submit the form, the billing plugin initializes automatically — " +
        "no manual restart needed.\n\n" +
        "Or, if you've been given a gateway URL by an operator, say " +
        "\"I have a gateway URL\" to switch to client-mode.",
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
