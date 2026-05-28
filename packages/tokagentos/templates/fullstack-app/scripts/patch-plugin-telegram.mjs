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
  "        service.setupMiddlewares();\n" +
  "        service.setupMessageHandlers();\n" +
  "        const bot = service.bot;\n" +
  "        if (!bot) {\n" +
  '          throw new Error("Telegram bot was not initialized");\n' +
  "        }\n" +
  "        // Race initializeBot() against a 3s timeout. Telegraf 4.x's\n" +
  "        // bot.launch() awaits the infinite polling loop, so its Promise\n" +
  "        // resolves only when the bot stops — but it DOES reject fast on\n" +
  "        // 409 / network errors. If we get a fast rejection, throw to\n" +
  "        // trigger the outer retry loop (Telegram's polling-slot grace\n" +
  "        // period from a previous run releases within a few seconds).\n" +
  "        // If the timer wins, polling is running successfully.\n" +
  "        const initPromise = service.initializeBot();\n" +
  "        const settled = await Promise.race([\n" +
  "          initPromise.then(\n" +
  "            (v) => ({ ok: true, value: v }),\n" +
  "            (err) => ({ ok: false, error: err })\n" +
  "          ),\n" +
  "          new Promise((resolve) =>\n" +
  "            setTimeout(() => resolve({ timeout: true }), 3000)\n" +
  "          ),\n" +
  "        ]);\n" +
  "        if (settled && settled.ok === false) {\n" +
  "          throw settled.error;\n" +
  "        }\n" +
  "        if (!settled || !settled.ok) {\n" +
  "          initPromise.catch((err) => {\n" +
  "            logger4.error(\n" +
  "              { src: \"plugin:telegram\", agentId: runtime.agentId, err: err?.message ?? String(err) },\n" +
  '              "polling loop exited (background)"\n' +
  "            );\n" +
  "          });\n" +
  "        }\n" +
  "        await bot.telegram.getMe();\n";

const patched = original.replace(BUGGY_BLOCK, PATCHED_BLOCK);
writeFileSync(pluginPath, patched);
console.log(
  "\x1b[32m[patch-plugin-telegram]\x1b[0m " +
    "Applied Telegraf-4.x launch-await fix to @elizaos/plugin-telegram. " +
    "The bot will now register message handlers before polling starts so " +
    "incoming /start triggers the agent correctly.",
);
