/**
 * SETUP_BILLING conversational action (Phase 9).
 *
 * Triggered when the user asks the agent to "set up billing", "enable billing",
 * "configure payments", etc. The handler:
 *   1. Checks if billing is already initialized and asks to confirm reconfigure.
 *   2. Posts a status route URL or inline guidance the user can follow.
 *   3. Returns quickly — the actual setup happens in the BillingSetupPanel
 *      (GET /v1/billing/setup-panel or the setup route POST).
 *
 * Decision Z48: the hybrid UX model means the action responds with a short
 * message and a link to the setup panel. The panel itself is served at
 * GET /v1/billing/setup-panel (a static HTML form) for environments where the
 * companion UI's panel mechanism is not available. In the companion UI, the
 * frontend polls /v1/billing/status and can open the BillingSetupPanel
 * component when it detects billing is not configured.
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
  return /\b(billing|payments?|credits?|top[- ]?up|enable billing|set up billing|configure billing|web3 payments?)\b/i.test(
    text,
  );
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
    _message: Memory,
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

    await callback?.({
      text:
        `[Click here to open the billing setup panel](${setupPanelUrl})\n\n` +
        `If the link doesn't open, copy it into your browser: ${setupPanelUrl}\n\n` +
        "You'll need:\n" +
        "1. A Postgres connection string (or use the local Docker option)\n" +
        "2. Your chain RPC URL (e.g. Polygon, Base, or Titan)\n" +
        "3. Your deployed ClaudeVault contract address\n" +
        "4. Your deployed PTON token address\n" +
        "5. An operator Ethereum private key (or generate a fresh one)\n\n" +
        "Once you submit the form, the billing plugin initializes automatically — " +
        "no manual restart needed.",
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
