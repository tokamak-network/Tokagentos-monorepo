/**
 * SETUP_BILLING — v2.0.0 conversational onboarding.
 *
 * v1.x walked the user through ClaudeVault address, PTON address, operator
 * private key, BILLING_DATABASE_URL, auth secret, etc. — all of that lived
 * on the user's machine.
 *
 * v2.x is a thin client. The only setup decisions the user makes are:
 *   1. Which gateway URL to use (`TOKAGENT_GATEWAY_URL`).
 *      Default: `https://gateway.tokagent.ai`.
 *      Self-hosted operators can paste their own URL.
 *   2. (optional) An OPERATOR_PRIVATE_KEY for users running their own
 *      self-hosted gateway who want the wizard to write a `.env` line for
 *      that deployment. The CLI never uses the value at runtime.
 *
 * The wizard surfaces a chat reply with the relevant env-var snippet and
 * one-line setup instructions. Persistence (writing to `.env` / config.env)
 * happens out of band via the user's normal editor / `tokagent config` —
 * the v1.x crash-safe writer is gone with the rest of the DB layer.
 */

import type {
  Action,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@tokagentos/core';
import { isBillingStateInitialized, getBillingState } from '../state.js';

const DEFAULT_GATEWAY_URL = 'https://gateway.tokagent.ai';

function matchesBillingIntent(text: string): boolean {
  return /\b(billing|payments?|credits?|top[- ]?up|enable billing|set up billing|configure billing|web3 payments?|gateway url)\b/i.test(
    text,
  );
}

/** Build the chat reply the action returns. Pure function for testability. */
export function buildSetupMessage(opts: {
  alreadyInitialized: boolean;
  currentGatewayUrl: string | null;
}): string {
  if (opts.alreadyInitialized && opts.currentGatewayUrl) {
    return [
      `Billing is already active on this agent.`,
      ``,
      `**Current gateway:** \`${opts.currentGatewayUrl}\``,
      ``,
      `To point at a different gateway, set \`TOKAGENT_GATEWAY_URL\` in your` +
        ` \`.env\` (or run \`tokagent config set TOKAGENT_GATEWAY_URL=...\`)` +
        ` and restart the agent.`,
      ``,
      `For the hosted Tokagent gateway: \`TOKAGENT_GATEWAY_URL=${DEFAULT_GATEWAY_URL}\``,
      ``,
      `For a self-hosted gateway: \`TOKAGENT_GATEWAY_URL=https://your-gateway.example.com\``,
    ].join('\n');
  }

  return [
    `**Tokagent v2 billing setup**`,
    ``,
    `Tokagent v2 routes all billing through a hosted gateway — your CLI is now` +
      ` a thin forwarder. You only need to pick a gateway URL:`,
    ``,
    `1. **Hosted (default, recommended)** — uses the Tokagent team's gateway.` +
      ` Pay-as-you-go, no infra to run.`,
    `   Add to your \`.env\`:`,
    `   \`\`\``,
    `   BILLING_ENABLED=true`,
    `   TOKAGENT_GATEWAY_URL=${DEFAULT_GATEWAY_URL}`,
    `   \`\`\``,
    ``,
    `2. **Self-hosted** — point at a gateway you operate (see` +
      ` https://docs.tokagent.ai/self-host).`,
    `   \`\`\``,
    `   BILLING_ENABLED=true`,
    `   TOKAGENT_GATEWAY_URL=https://your-gateway.example.com`,
    `   # Optional — only if you also operate the gateway and want the wizard`,
    `   # to remind you which key the gateway runs as. Not used by the CLI.`,
    `   OPERATOR_PRIVATE_KEY=0x...`,
    `   \`\`\``,
    ``,
    `Restart the agent after updating \`.env\`. You can verify the gateway is` +
      ` reachable with:`,
    `   \`\`\`bash`,
    `   curl -fsS "$TOKAGENT_GATEWAY_URL/healthz"`,
    `   \`\`\``,
    ``,
    `Once billing is on, sign in from the dashboard or via SIWE and run` +
      ` \`POST /v1/topup/quote\` → \`POST /v1/topup/settle\` to deposit credits.`,
  ].join('\n');
}

export const setupBillingAction: Action = {
  name: 'SETUP_BILLING',
  similes: [
    'set up billing',
    'enable billing',
    'configure web3 payments',
    'configure billing',
    'setup billing',
    'activate billing',
    'turn on billing',
    'change gateway',
    'set gateway url',
  ],
  description:
    'Walks the user through pointing the CLI at the hosted Tokagent gateway ' +
    '(or a self-hosted one). v2.0.0+: no DB setup, no operator key, no ' +
    'chain wiring lives on the CLI anymore.',

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
  ): Promise<boolean> => {
    const text = message.content?.text ?? '';
    return matchesBillingIntent(text);
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<undefined> => {
    let currentGatewayUrl: string | null = null;
    const alreadyInitialized = isBillingStateInitialized();
    if (alreadyInitialized) {
      try {
        currentGatewayUrl = getBillingState().config.gatewayUrl;
      } catch {
        currentGatewayUrl = null;
      }
    }

    await callback?.({
      text: buildSetupMessage({ alreadyInitialized, currentGatewayUrl }),
      action: 'SETUP_BILLING',
    } as Content);
    return undefined;
  },

  examples: [
    [
      { name: 'user', content: { text: 'set up billing' } },
      {
        name: 'agent',
        content: {
          text:
            'Tokagent v2 routes billing through a hosted gateway — your CLI ' +
            'is now a thin forwarder. Add BILLING_ENABLED=true and ' +
            `TOKAGENT_GATEWAY_URL=${DEFAULT_GATEWAY_URL} to .env, then restart.`,
          actions: ['SETUP_BILLING'],
        },
      },
    ],
    [
      { name: 'user', content: { text: 'change my gateway url' } },
      {
        name: 'agent',
        content: {
          text:
            'Set TOKAGENT_GATEWAY_URL in your .env to the gateway you want, ' +
            'then restart the agent.',
          actions: ['SETUP_BILLING'],
        },
      },
    ],
  ],
};
