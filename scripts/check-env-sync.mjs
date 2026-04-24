#!/usr/bin/env node
// Verifies root .env.example matches every template .env.example.
// Run via: bun run check:env-sync
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const canonical = join(ROOT, '.env.example');
const targets = [
  join(ROOT, 'packages/tokagentos/templates/fullstack-app/.env.example'),
  join(ROOT, 'packages/templates/fullstack-app/.env.example'),
];

if (!existsSync(canonical)) {
  console.error(`Missing canonical file: ${canonical}`);
  process.exit(2);
}
const expected = readFileSync(canonical, 'utf8');

let drift = false;
for (const t of targets) {
  if (!existsSync(t)) continue; // skip if template doesn't exist
  const actual = readFileSync(t, 'utf8');
  if (actual !== expected) {
    console.error(`DRIFT: ${t} differs from ${canonical}`);
    drift = true;
  }
}

if (drift) {
  console.error('\nRun: cp .env.example <each drifted path>');
  process.exit(1);
}
console.log('env-sync: OK');
