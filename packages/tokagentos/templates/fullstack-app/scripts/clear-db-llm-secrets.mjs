#!/usr/bin/env node
/**
 * Remove LLM provider API keys (OPENROUTER, ANTHROPIC, OPENAI, GOOGLE, GROQ)
 * from the agents DB table. mergeDbSettings() in @elizaos/core loads
 * agents.secrets and agents.settings.secrets into character.settings.secrets
 * on every boot, and runtime.getSetting() checks character.settings.secrets
 * BEFORE process.env — so a stale DB-stored key shadows the .env value
 * forever. After running this, .env becomes the source of truth.
 *
 * Run with the agent STOPPED (`Ctrl-C` your `bun run dev`):
 *   bun run scripts/clear-db-llm-secrets.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_DIR = path.join(PROJECT_ROOT, ".eliza", ".elizadb");

if (!existsSync(DB_DIR)) {
  console.error(`PGLite directory not found at ${DB_DIR}`);
  process.exit(1);
}

const LLM_KEYS = [
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
  "GROQ_API_KEY",
];

const { PGlite } = await import("@electric-sql/pglite");
const db = new PGlite(DB_DIR);
await db.waitReady;

const before = await db.query(
  "SELECT id, name, secrets, settings FROM agents",
);
console.log(`Agents in DB: ${before.rows.length}`);
for (const row of before.rows) {
  const id = row.id;
  const name = row.name;
  const topSecrets = row.secrets && typeof row.secrets === "object" ? row.secrets : {};
  const settingsSecrets =
    row.settings &&
    typeof row.settings === "object" &&
    row.settings.secrets &&
    typeof row.settings.secrets === "object"
      ? row.settings.secrets
      : {};
  const allKeys = new Set([
    ...Object.keys(topSecrets),
    ...Object.keys(settingsSecrets),
  ]);
  const llmKeysPresent = [...allKeys].filter((k) => LLM_KEYS.includes(k));
  if (llmKeysPresent.length === 0) {
    console.log(`  ${name} (${id}): no LLM keys stored ✓`);
    continue;
  }
  console.log(`  ${name} (${id}): clearing ${llmKeysPresent.join(", ")}`);
  const newTopSecrets = { ...topSecrets };
  const newSettings =
    row.settings && typeof row.settings === "object" ? { ...row.settings } : {};
  const newSettingsSecrets = { ...settingsSecrets };
  for (const k of llmKeysPresent) {
    delete newTopSecrets[k];
    delete newSettingsSecrets[k];
  }
  newSettings.secrets = newSettingsSecrets;
  await db.query(
    "UPDATE agents SET secrets = $1, settings = $2 WHERE id = $3",
    [
      JSON.stringify(newTopSecrets),
      JSON.stringify(newSettings),
      id,
    ],
  );
}

console.log("\nDone. Restart `bun run dev` — .env is now the source of truth.");
await db.close();
