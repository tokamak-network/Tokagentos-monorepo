#!/usr/bin/env node
/**
 * Patch @elizaos/plugin-telegram for a Telegraf 4.x compatibility bug.
 *
 * The bug: plugin-telegram's TelegramService.start() does
 *   await service.initializeBot();
 *   service.setupMiddlewares();
 *   service.setupMessageHandlers();
 *
 * `initializeBot()` does `await bot.launch({...})`. In Telegraf 4.x,
 * `bot.launch()` internally does `await this.startPolling(...)` which
 * `return this.polling.loop(...)` — the INFINITE long-poll loop. The
 * launch Promise therefore resolves only when the bot is stopped, never
 * during startup. Awaiting it here blocks forever; setupMessageHandlers
 * is never called; messages arrive at Telegraf but no `on('message')`
 * handler is registered, so they are silently dropped. Symptom: bot
 * appears connected (TCP open to Telegram), service never registers in
 * runtime, /start triggers nothing in the agent.
 *
 * The fix: register handlers BEFORE launching polling, then fire-and-
 * forget the launch. Telegraf 4.x is designed to be called this way —
 * see https://github.com/telegraf/telegraf/discussions/1344
 *
 * Runs at postinstall + before `bun run dev`. Idempotent: detects the
 * patched marker and skips if already applied. No-op when the plugin
 * isn't installed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const pluginPath = path.join(
  PROJECT_ROOT,
  "node_modules",
  "@elizaos",
  "plugin-telegram",
  "dist",
  "index.js",
);

if (!existsSync(pluginPath)) {
  // Plugin not installed — nothing to patch. Channels are optional.
  process.exit(0);
}

const TOKAGENT_PATCH_MARKER = "// TOKAGENT PATCH: register handlers BEFORE";
const original = readFileSync(pluginPath, "utf8");

if (original.includes(TOKAGENT_PATCH_MARKER)) {
  // Already patched — nothing to do.
  process.exit(0);
}

// Detect the original buggy block. Be conservative: match exact
// whitespace + sequence to avoid silently patching a future upstream
// fix that already addressed this.
const BUGGY_BLOCK =
  "        await service.initializeBot();\n" +
  "        service.setupMiddlewares();\n" +
  "        service.setupMessageHandlers();\n" +
  "        const bot = service.bot;\n" +
  "        if (!bot) {\n" +
  '          throw new Error("Telegram bot was not initialized");\n' +
  "        }\n" +
  "        await bot.telegram.getMe();\n";

if (!original.includes(BUGGY_BLOCK)) {
  console.warn(
    "\x1b[33m[patch-plugin-telegram]\x1b[0m " +
      "@elizaos/plugin-telegram doesn't match the expected buggy pattern. " +
      "Upstream may have already fixed the Telegraf 4.x launch-await bug, " +
      "or the version drifted from the one we tested against (2.0.0-alpha.537). " +
      "Skipping patch. If /start to your bot doesn't trigger an LLM reply, " +
      "open the file and check whether `await bot.launch()` still blocks " +
      "forever in TelegramService.start().",
  );
  process.exit(0);
}

const PATCHED_BLOCK =
  "        " + TOKAGENT_PATCH_MARKER + " launching polling so we\n" +
  "        // never race against the loop delivering updates without a handler.\n" +
  "        // Field-observed failure mode: Telegraf 4.x bot.launch() under Bun\n" +
  "        // appears to enter polling.loop() but never actually emits getUpdates\n" +
  "        // requests (TCP connections to api.telegram.org open but idle).\n" +
  "        // Service registers, looks healthy, but inbound messages stay queued.\n" +
  "        // We bypass Telegraf's launch entirely and drive polling ourselves\n" +
  "        // via bot.telegram.getUpdates + bot.handleUpdate — the same primitives\n" +
  "        // Telegraf's internal loop is supposed to use, just without the\n" +
  "        // broken middle layer.\n" +
  "        service.setupMiddlewares();\n" +
  "        service.setupMessageHandlers();\n" +
  "        const bot = service.bot;\n" +
  "        if (!bot) {\n" +
  '          throw new Error("Telegram bot was not initialized");\n' +
  "        }\n" +
  "        bot.start((ctx) => {\n" +
  "          service.runtime.emitEvent(\n" +
  '            "TELEGRAM_SLASH_START",\n' +
  '            { ctx, runtime: service.runtime, source: "telegram" }\n' +
  "          );\n" +
  "        });\n" +
  "        await bot.telegram.getMe();\n" +
  "        await bot.telegram.deleteWebhook({ drop_pending_updates: false });\n" +
  "        if (service.botToken) {\n" +
  "          ACTIVE_TELEGRAM_POLLERS.set(service.botToken, {\n" +
  "            bot,\n" +
  "            agentId: runtime.agentId,\n" +
  "          });\n" +
  "        }\n" +
  '        const allowedUpdates = ["message", "message_reaction"];\n' +
  "        let offset = 0;\n" +
  "        let pollErrorBackoffMs = 1000;\n" +
  "        service._tokagentPollingActive = true;\n" +
  "        (async () => {\n" +
  "          while (service._tokagentPollingActive) {\n" +
  "            try {\n" +
  "              const updates = await bot.telegram.getUpdates(\n" +
  "                30, 100, offset, allowedUpdates\n" +
  "              );\n" +
  "              if (!service._tokagentPollingActive) break;\n" +
  "              for (const update of updates) {\n" +
  "                offset = update.update_id + 1;\n" +
  "                try {\n" +
  "                  await bot.handleUpdate(update);\n" +
  "                } catch (err) {\n" +
  "                  logger4.error(\n" +
  '                    { src: "plugin:telegram", agentId: runtime.agentId, err: err?.message ?? String(err) },\n' +
  '                    "handleUpdate failed"\n' +
  "                  );\n" +
  "                }\n" +
  "              }\n" +
  "              pollErrorBackoffMs = 1000;\n" +
  "            } catch (err) {\n" +
  "              const msg = err?.message ?? String(err);\n" +
  "              logger4.warn(\n" +
  '                { src: "plugin:telegram", agentId: runtime.agentId, err: msg, backoffMs: pollErrorBackoffMs },\n' +
  '                "getUpdates failed; backing off"\n' +
  "              );\n" +
  "              await new Promise((r) => setTimeout(r, pollErrorBackoffMs));\n" +
  "              pollErrorBackoffMs = Math.min(pollErrorBackoffMs * 2, 30000);\n" +
  "            }\n" +
  "          }\n" +
  "          logger4.info(\n" +
  '            { src: "plugin:telegram", agentId: runtime.agentId },\n' +
  '            "Manual polling loop exited"\n' +
  "          );\n" +
  "        })();\n";

const patched = original.replace(BUGGY_BLOCK, PATCHED_BLOCK);
writeFileSync(pluginPath, patched);
console.log(
  "\x1b[32m[patch-plugin-telegram]\x1b[0m " +
    "Applied Telegraf-4.x launch-await fix to @elizaos/plugin-telegram. " +
    "The bot will now register message handlers before polling starts so " +
    "incoming /start triggers the agent correctly.",
);
