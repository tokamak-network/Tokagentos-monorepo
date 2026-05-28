#!/usr/bin/env node
/**
 * Diagnose messaging-channel configuration drift between .env and what
 * the elizaOS plugin loader actually checks. Three classes of failure
 * have hit users in the field:
 *
 *   1. Env-name mismatch — `.env` declares DISCORD_BOT_TOKEN but the
 *      plugin loader checks DISCORD_API_TOKEN. core-plugins.ts mirrors
 *      these at boot, but a missing mirror or a typo silently disables
 *      the plugin.
 *   2. Partial credentials — X/Twitter requires FOUR keys (api key,
 *      secret, access token, access secret). Setting only two of four
 *      leaves the plugin un-loaded with no error message.
 *   3. Wrong env contract — WHATSAPP_ACCESS_TOKEN and
 *      SIGNAL_PHONE_NUMBER are misleading names a user picks up from
 *      the old .env.example. Those plugins use WHATSAPP_AUTH_DIR (QR
 *      session) and SIGNAL_HTTP_URL (bridge) instead.
 *
 * Runs at postinstall + before `bun run dev`. Warns (does not fail) so
 * it doesn't block users running in dev-mode without any channels —
 * channels are optional. The output names the exact fix for each
 * detected issue.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

function readDotenv() {
  const dotenvPath = path.join(PROJECT_ROOT, ".env");
  if (!existsSync(dotenvPath)) return {};
  const out = {};
  for (const rawLine of readFileSync(dotenvPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    out[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readDotenv();
const warnings = [];
function warn(channel, msg) {
  warnings.push(`  [${channel}] ${msg}`);
}

// Telegram — single-token, env name matches. Check format then probe
// for the 409 Conflict failure mode (another process polling with the
// same token). The plugin's retry loop gives up after ~10s and the
// service is stuck in a not-started state with no error in the chat UI
// — the user just sees the bot stay offline forever. Catching this at
// install / dev surface time saves hours of debugging.
if (env.TELEGRAM_BOT_TOKEN) {
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(env.TELEGRAM_BOT_TOKEN)) {
    warn(
      "telegram",
      `TELEGRAM_BOT_TOKEN doesn't match BotFather format (id:secret). The plugin will fail to connect.`,
    );
  } else {
    // Probe for an existing long-poll consumer. getUpdates returns
    // 409 Conflict when another instance is already polling. We use a
    // 1-second timeout to keep the install hook snappy and a small
    // limit because we only care about the status code, not the data.
    try {
      const probe = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?timeout=1&limit=1`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (probe.status === 409) {
        const body = await probe.text();
        warn(
          "telegram",
          `Another process is already long-polling with this bot token (Telegram returned 409 Conflict). ` +
            `Telegram allows only ONE consumer per token at a time. ` +
            `Most common culprits, in order of likelihood:\n` +
            `      1. \`bun --watch\` hot-reloading the agent: when a file changes, bun re-imports the\n` +
            `         module without killing the previous Telegraf instance, so the new instance 409s\n` +
            `         against the old one's poll. Fix: hard-kill bun and re-run \`bun run dev\`.\n` +
            `      2. A stale \`bun run dev\` from another shell — \`lsof -nP -iTCP | grep 149.154\`.\n` +
            `      3. A Claude Code Telegram plugin or external deployment using the same token.\n` +
            `      4. Telegram hasn't released the polling slot from the previous consumer yet —\n` +
            `         wait ~10s after killing the previous process and retry.\n` +
            `      Detail: ${body.slice(0, 200)}`,
        );
      } else if (probe.status === 401) {
        warn(
          "telegram",
          `TELEGRAM_BOT_TOKEN was rejected by Telegram (401 Unauthorized). The bot was either deleted or the token was revoked. Mint a fresh one via BotFather.`,
        );
      }
    } catch {
      // Network/timeout — non-fatal. The plugin will discover this at
      // boot.
    }
  }
}

// Discord — env contract mismatch. core-plugins.ts mirrors DISCORD_BOT_TOKEN
// to DISCORD_API_TOKEN at boot, but the user should be aware so a
// hand-rolled deployment without the mirror still works.
if (env.DISCORD_BOT_TOKEN && !env.DISCORD_API_TOKEN) {
  warn(
    "discord",
    `DISCORD_BOT_TOKEN is set but DISCORD_API_TOKEN isn't. The boot-time mirror in core-plugins.ts will bridge them, but if you deploy with a different bootstrap, set DISCORD_API_TOKEN directly.`,
  );
}

// X / Twitter — requires FOUR keys. Setting just one is a common mistake.
const X_KEYS = [
  ["TWITTER_API_KEY", "X_API_KEY"],
  ["TWITTER_API_SECRET", "X_API_SECRET"],
  ["TWITTER_ACCESS_TOKEN", "X_ACCESS_TOKEN"],
  ["TWITTER_ACCESS_TOKEN_SECRET", "X_ACCESS_TOKEN_SECRET"],
];
const xPresent = X_KEYS.map(([twitterName, xName]) =>
  Boolean(env[twitterName] || env[xName]),
);
const xPresentCount = xPresent.filter(Boolean).length;
if (xPresentCount > 0 && xPresentCount < 4) {
  const missing = X_KEYS.filter((_, i) => !xPresent[i])
    .map(([twitterName]) => twitterName)
    .join(", ");
  warn(
    "x/twitter",
    `${xPresentCount}/4 X credentials set. @elizaos/plugin-x requires all FOUR. Missing: ${missing}.`,
  );
}

// WhatsApp — the legacy WHATSAPP_ACCESS_TOKEN name does nothing.
if (env.WHATSAPP_ACCESS_TOKEN && !env.WHATSAPP_AUTH_DIR) {
  warn(
    "whatsapp",
    `WHATSAPP_ACCESS_TOKEN is set but the plugin uses QR-code pairing, not API tokens. Remove WHATSAPP_ACCESS_TOKEN and set WHATSAPP_AUTH_DIR to a writable directory (e.g. ./whatsapp-auth) instead. Pair via Settings → Channels → WhatsApp.`,
  );
}

// Signal — SIGNAL_PHONE_NUMBER alone does nothing.
if (env.SIGNAL_PHONE_NUMBER && !env.SIGNAL_HTTP_URL) {
  warn(
    "signal",
    `SIGNAL_PHONE_NUMBER is set but the plugin requires SIGNAL_HTTP_URL (a signal-cli bridge endpoint) AND SIGNAL_ACCOUNT_NUMBER. SIGNAL_PHONE_NUMBER alone is not honored. See https://github.com/AsamK/signal-cli for the bridge.`,
  );
}

if (warnings.length > 0) {
  console.warn("\n\x1b[33m[verify-channels]\x1b[0m Channel credential drift:");
  for (const w of warnings) console.warn(w);
  console.warn(
    `\n  Save channel tokens via Settings → Channels in the UI for the most reliable flow — it validates against each platform's API and triggers an automatic restart so the bot comes online immediately. Editing .env requires a manual \`bun run dev\` restart.\n`,
  );
}
// Soft check — don't fail the build. Channels are optional.
