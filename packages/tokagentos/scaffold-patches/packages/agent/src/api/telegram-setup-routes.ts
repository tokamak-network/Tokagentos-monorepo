/**
 * Telegram bot setup HTTP routes.
 *
 * Provides a guided setup flow for connecting a Telegram bot:
 *
 *   POST /api/telegram-setup/validate-token   validate + save bot token
 *   GET  /api/telegram-setup/status           check current connection
 *   POST /api/telegram-setup/disconnect       remove saved token
 *
 * Token validation hits the Telegram Bot API getMe endpoint directly.
 *
 * Tokagent overlay differences vs upstream:
 *   - On successful validation the token is mirrored to process.env
 *     IMMEDIATELY (`TELEGRAM_BOT_TOKEN`) so the plugin-loader gate in
 *     character.ts sees it on the next plugin-list computation.
 *   - A runtime restart is scheduled via `scheduleRuntimeRestart` (when
 *     available) so the plugin actually comes online without the user
 *     manually restarting `bun run dev`. The response includes
 *     `restartScheduled: boolean` so the UI can surface accurate state.
 *   - Disconnect symmetrically clears process.env and schedules a
 *     restart so the running plugin disconnects without manual restart.
 */

import nodeFs from "node:fs/promises";
import type http from "node:http";
import nodePath from "node:path";
import { registerEscalationChannel } from "../services/escalation.js";
import { setOwnerContact } from "./owner-contact-helpers.js";
import type { RouteHelpers } from "./route-helpers.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const MAX_BODY_BYTES = 4096;

/**
 * Write or update a key in the project's `.env` file (process.cwd()/.env).
 * Inlined copy of the same helper in plugin-routes.ts — keep behavior in
 * sync if you edit one, fix the other.
 *
 * Behavior:
 *   - If `.env` doesn't exist → create it.
 *   - If the key already appears (active line) → replace.
 *   - If the key appears commented (`# KEY=...`) → uncomment and set.
 *   - Otherwise → append `KEY=value\n`.
 * Atomic write via tmp-file + rename. chmod 0600 because tokens are
 * sensitive.
 */
async function writeProjectEnvVar(
  key: string,
  value: string,
): Promise<string> {
  const envPath = nodePath.join(process.cwd(), ".env");
  let existing = "";
  try {
    existing = await nodeFs.readFile(envPath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
  const line = `${key}=${value}`;
  const activeRe = new RegExp(`^${key}=.*$`, "m");
  const commentedRe = new RegExp(`^#\\s*${key}=.*$`, "m");
  let next: string;
  if (activeRe.test(existing)) {
    next = existing.replace(activeRe, line);
  } else if (commentedRe.test(existing)) {
    next = existing.replace(commentedRe, line);
  } else if (existing.length === 0) {
    next = `${line}\n`;
  } else {
    const sep = existing.endsWith("\n") ? "" : "\n";
    next = `${existing}${sep}${line}\n`;
  }
  const tmpPath = `${envPath}.tmp.${process.pid}`;
  await nodeFs.writeFile(tmpPath, next, { mode: 0o600 });
  await nodeFs.rename(tmpPath, envPath);
  try {
    await nodeFs.chmod(envPath, 0o600);
  } catch {
    // best-effort permission tighten
  }
  return envPath;
}

async function clearProjectEnvVar(key: string): Promise<void> {
  const envPath = nodePath.join(process.cwd(), ".env");
  let existing = "";
  try {
    existing = await nodeFs.readFile(envPath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    return;
  }
  const activeRe = new RegExp(`^${key}=.*$`, "m");
  if (!activeRe.test(existing)) return;
  const next = existing.replace(activeRe, `${key}=`);
  const tmpPath = `${envPath}.tmp.${process.pid}`;
  await nodeFs.writeFile(tmpPath, next, { mode: 0o600 });
  await nodeFs.rename(tmpPath, envPath);
}

interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

export interface TelegramSetupRouteState {
  config: Record<string, unknown> & {
    connectors?: Record<string, Record<string, unknown>>;
  };
  saveConfig: () => void;
  runtime?: {
    getService(type: string): unknown;
    getSetting(key: string): string | undefined;
  };
  scheduleRuntimeRestart?: (reason: string) => void;
}

export async function handleTelegramSetupRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: TelegramSetupRouteState,
  helpers: RouteHelpers,
): Promise<boolean> {
  if (!pathname.startsWith("/api/telegram-setup")) return false;

  // ── POST /api/telegram-setup/validate-token ──────────────────────────
  if (method === "POST" && pathname === "/api/telegram-setup/validate-token") {
    const body = await helpers.readJsonBody<{ token?: string }>(req, res, {
      maxBytes: MAX_BODY_BYTES,
    });
    if (!body) return true;

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      helpers.json(res, { ok: false, error: "token is required" });
      return true;
    }

    // Basic format check: <bot_id>:<alphanumeric>
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
      helpers.json(res, {
        ok: false,
        error: "Token format invalid. Expected format: 123456:ABC-DEF...",
      });
      return true;
    }

    try {
      const apiRes = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getMe`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!apiRes.ok) {
        helpers.json(res, {
          ok: false,
          error: `Telegram API returned ${apiRes.status}. Check that the token is correct.`,
        });
        return true;
      }

      const data = (await apiRes.json()) as {
        ok: boolean;
        result?: TelegramBotInfo;
      };
      if (!data.ok || !data.result) {
        helpers.json(res, {
          ok: false,
          error: "Telegram API returned unexpected response",
        });
        return true;
      }

      const bot = data.result;

      // Save token to connector config (persistent).
      let connectors = state.config.connectors;
      if (!connectors) {
        connectors = {};
        (state.config as Record<string, unknown>).connectors = connectors;
      }
      if (!connectors.telegram || typeof connectors.telegram !== "object") {
        connectors.telegram = {};
      }
      (connectors.telegram as Record<string, unknown>).botToken = token;

      // Auto-populate owner contact so LifeOps can deliver reminders
      setOwnerContact(state.config as Parameters<typeof setOwnerContact>[0], {
        source: "telegram",
        channelId: String(bot.id),
      });
      // Add Telegram to the escalation channel list so it is reachable
      // without the user explicitly configuring escalation.
      registerEscalationChannel("telegram");

      state.saveConfig();

      // Persist to project .env — the PRIMARY source of truth. Bun
      // auto-loads .env at process start, so after the scheduled
      // restart, process.env.TELEGRAM_BOT_TOKEN will be populated BEFORE
      // any agent code runs (including character.ts's plugin-list
      // builder). Writing only to ~/.NAME/NAME.json is unreliable
      // because `applyConnectorSecretsToEnv` may run after the plugin
      // list has already been computed, leaving the plugin unloaded.
      // Keeping the namespace-config write above for backward compat
      // with any code path that reads connectors.telegram.botToken
      // directly.
      let envWritten = false;
      try {
        await writeProjectEnvVar("TELEGRAM_BOT_TOKEN", token);
        // Auto-enable replies. Without TELEGRAM_AUTO_REPLY=true the
        // plugin ingests inbound messages into memory but never invokes
        // the agent's reply pipeline — a silent failure that's logged
        // only at debug level. Default-on when the user explicitly
        // connects a bot via the Settings UI matches the user's
        // intent: "I want this bot to reply to me."
        await writeProjectEnvVar("TELEGRAM_AUTO_REPLY", "true");
        process.env.TELEGRAM_AUTO_REPLY = "true";
        envWritten = true;
      } catch (err) {
        // Persisting to .env is best-effort — the token is also in the
        // namespace config, which is enough for the next boot via
        // applyConnectorSecretsToEnv. Log but don't fail the save.
        console.warn(
          `[telegram-setup] Failed to write TELEGRAM_BOT_TOKEN to project .env: ${err instanceof Error ? err.message : String(err)}. The token is still saved in the namespace config and will be picked up on next boot.`,
        );
      }

      // Mirror to process.env IMMEDIATELY for the current process so
      // any code path that reads process.env before the restart cycle
      // (logging, status endpoints, etc.) sees the value.
      process.env.TELEGRAM_BOT_TOKEN = token;

      // Respond BEFORE scheduling the restart. `scheduleRuntimeRestart`
      // tears down the HTTP server mid-response if synchronous; defer
      // to the next tick so the response is flushed.
      const canRestart = typeof state.scheduleRuntimeRestart === "function";
      helpers.json(res, {
        ok: true,
        bot: {
          id: bot.id,
          username: bot.username,
          firstName: bot.first_name,
        },
        restartScheduled: canRestart,
        envWritten,
      });
      if (canRestart) {
        setImmediate(() => {
          try {
            state.scheduleRuntimeRestart?.("telegram-bot-connected");
          } catch {
            // Best-effort — the token is already persisted and a manual
            // restart will pick it up.
          }
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      helpers.json(res, {
        ok: false,
        error: `Failed to reach Telegram API: ${message}`,
      });
    }
    return true;
  }

  // ── GET /api/telegram-setup/status ───────────────────────────────────
  if (method === "GET" && pathname === "/api/telegram-setup/status") {
    const connectors = state.config.connectors ?? {};
    const tgConfig = connectors.telegram as Record<string, unknown> | undefined;
    const hasToken = Boolean(
      tgConfig?.botToken || state.runtime?.getSetting("TELEGRAM_BOT_TOKEN"),
    );

    // Check if the Telegram service is running
    const service = state.runtime?.getService("telegram");
    const connected = Boolean(service);

    helpers.json(res, {
      available: true,
      hasToken,
      connected,
    });
    return true;
  }

  // ── POST /api/telegram-setup/disconnect ──────────────────────────────
  if (method === "POST" && pathname === "/api/telegram-setup/disconnect") {
    const connectors = state.config.connectors ?? {};
    const tgConfig = connectors.telegram as Record<string, unknown> | undefined;
    if (tgConfig) {
      delete tgConfig.botToken;
      state.saveConfig();
    }
    // Clear from project .env so the next boot doesn't re-load the
    // plugin from the stale value. Symmetric with connect.
    try {
      await clearProjectEnvVar("TELEGRAM_BOT_TOKEN");
    } catch {
      // best-effort
    }
    // Clear from process.env and restart so the running plugin tears
    // down without a manual restart. Symmetric with connect.
    delete process.env.TELEGRAM_BOT_TOKEN;
    const canRestart = typeof state.scheduleRuntimeRestart === "function";
    helpers.json(res, { ok: true, restartScheduled: canRestart });
    if (canRestart) {
      setImmediate(() => {
        try {
          state.scheduleRuntimeRestart?.("telegram-bot-disconnected");
        } catch {
          // Best-effort.
        }
      });
    }
    return true;
  }

  return false;
}
