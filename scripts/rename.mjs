#!/usr/bin/env node
// Deterministic rename script: elizaOS -> tokagentOS
//
// Rewrites every text occurrence of the elizaOS brand to tokagentOS across the
// fork tree. The @elizaos/<name> scope is rewritten only when <name> is a
// package defined inside this fork's own packages/ directory; references to
// upstream-published plugin packages like @elizaos/plugin-anthropic are left
// alone.
//
// Usage:
//   node scripts/rename.mjs <root>          # apply
//   node scripts/rename.mjs <root> --dry-run
//   node scripts/rename.mjs --self-test

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const SKIP_DIRS = new Set([
	'node_modules', 'dist', '.turbo', 'target', 'build', '.next',
	'.git', 'plugins',
]);
// rename.mjs itself MUST skip its own filename — otherwise it rewrites
// its own source during a full-tree pass and subsequent runs break.
const SKIP_FILES = new Set(['LICENSE', 'bun.lock', 'package-lock.json', 'rename.mjs']);
const BINARY_EXTS = new Set([
	'.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.zip',
	'.tar', '.gz', '.wasm', '.so', '.dylib', '.dll', '.lock',
	'.woff', '.woff2', '.ttf', '.otf', '.eot',
	'.mp3', '.mp4', '.webm', '.ogg',
]);

export function shouldSkipPath(rel) {
	const parts = rel.split('/');
	if (parts.some((p) => SKIP_DIRS.has(p))) return true;
	const base = parts[parts.length - 1];
	if (SKIP_FILES.has(base)) return true;
	if (BINARY_EXTS.has(extname(base).toLowerCase())) return true;
	return false;
}

export function buildAllowlist(root) {
	const pkgDir = join(root, 'packages');
	if (!existsSync(pkgDir)) return new Set();
	const names = new Set();
	for (const entry of readdirSync(pkgDir)) {
		const pkgJson = join(pkgDir, entry, 'package.json');
		if (!existsSync(pkgJson)) continue;
		try {
			const parsed = JSON.parse(readFileSync(pkgJson, 'utf8'));
			const name = parsed.name ?? '';
			const m = name.match(/^@elizaos\/(.+)$/);
			if (m) names.add(m[1]);
		} catch {}
	}
	return names;
}

export function substitute(input, allowlist) {
	let out = input;
	out = out.replace(/@elizaos\/([a-zA-Z0-9_.-]+)/g, (match, name) =>
		allowlist.has(name) ? `@tokagentos/${name}` : match,
	);
	out = out.replace(/elizaOS/g, 'tokagentOS');
	out = out.replace(/ElizaOS/g, 'TokagentOS');
	out = out.replace(/ELIZAOS/g, 'TOKAGENTOS');
	// Rewrite bare `elizaos` everywhere EXCEPT when it is part of a scoped
	// package ref starting with `@elizaos/` — those are handled above and
	// must preserve the original scope for non-allowlisted plugin packages.
	out = out.replace(/(?<!@)elizaos/g, 'tokagentos');
	// Bare 'eliza'/'Eliza'/'ELIZA' — after the *os variants are already
	// handled above, these are safe to rewrite. Covers ELIZA_* env vars,
	// .eliza/ config dirs, .elizadb paths, ElizaConfig typedefs.
	// Skip anything preceded by `@` (npm scopes like @elizaos/plugin-*
	// where the `os` suffix preserved the scope — must not be re-entered).
	out = out.replace(/(?<!@)ELIZA/g, 'TOKAGENT');
	out = out.replace(/(?<!@)Eliza/g, 'Tokagent');
	out = out.replace(/(?<!@)eliza/g, 'tokagent');
	return out;
}

function walk(dir, root, onFile) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const rel = relative(root, full);
		if (shouldSkipPath(rel)) continue;
		let st;
		try {
			st = statSync(full);
		} catch {
			// Broken symlink or permission error — skip.
			continue;
		}
		if (st.isDirectory()) walk(full, root, onFile);
		else if (st.isFile()) onFile(full, rel);
	}
}

function isText(buf) {
	// Heuristic: bail out on NUL byte in first 8KB
	const n = Math.min(buf.length, 8192);
	for (let i = 0; i < n; i += 1) {
		if (buf[i] === 0) return false;
	}
	return true;
}

function selfTest() {
	let fails = 0;
	const expect = (label, actual, expected) => {
		if (actual !== expected) {
			console.error(`FAIL: ${label}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
			fails += 1;
		}
	};

	// substitute
	const allow = new Set(['core', 'client']);
	expect('elizaos lower', substitute('elizaos', allow), 'tokagentos');
	expect('ElizaOS pascal', substitute('ElizaOS', allow), 'TokagentOS');
	expect('elizaOS camel', substitute('elizaOS', allow), 'tokagentOS');
	expect('ELIZAOS upper', substitute('ELIZAOS', allow), 'TOKAGENTOS');
	expect('@tokagentos/core allowlisted', substitute('@tokagentos/core', allow), '@tokagentos/core');
	expect('@elizaos/client allowlisted', substitute('@elizaos/client', allow), '@tokagentos/client');
	expect('@elizaos/plugin-x not allowlisted', substitute('@elizaos/plugin-anthropic', allow), '@elizaos/plugin-anthropic');
	expect('bare eliza', substitute('eliza', allow), 'tokagent');
	expect('.elizadb path', substitute('.elizadb', allow), '.tokagentdb');
	expect('.eliza/ config dir', substitute('.eliza/config', allow), '.tokagent/config');
	expect('ELIZA_ env var', substitute('ELIZA_CONFIG', allow), 'TOKAGENT_CONFIG');
	expect('ElizaConfig typedef', substitute('ElizaConfig', allow), 'TokagentConfig');

	// shouldSkipPath
	expect('plugins skipped', shouldSkipPath('plugins/plugin-anthropic/src/index.ts'), true);
	expect('node_modules skipped', shouldSkipPath('node_modules/foo/index.js'), true);
	expect('src NOT skipped', shouldSkipPath('packages/core/src/index.ts'), false);
	expect('LICENSE skipped', shouldSkipPath('LICENSE'), true);
	expect('png skipped', shouldSkipPath('public/logo.png'), true);

	if (fails === 0) {
		console.log('self-test: OK');
		process.exit(0);
	} else {
		console.error(`self-test: ${fails} failures`);
		process.exit(1);
	}
}

function main() {
	if (process.argv.includes('--self-test')) selfTest();

	const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
	const root = args[0] ?? process.cwd();
	const dryRun = process.argv.includes('--dry-run');
	const allowlist = buildAllowlist(root);
	console.error(`[rename] root: ${root}`);
	console.error(`[rename] allowlist: ${[...allowlist].sort().join(', ')}`);
	console.error(`[rename] dry-run: ${dryRun}`);

	let changed = 0;
	let scanned = 0;
	walk(root, root, (full, rel) => {
		scanned += 1;
		let buf;
		try {
			buf = readFileSync(full);
		} catch {
			return;
		}
		if (!isText(buf)) return;
		const before = buf.toString('utf8');
		const after = substitute(before, allowlist);
		if (before !== after) {
			changed += 1;
			if (!dryRun) writeFileSync(full, after);
			console.log(`${dryRun ? '[DRY]' : '[WRITE]'} ${rel}`);
		}
	});
	console.error(`[rename] scanned ${scanned} files, ${changed} ${dryRun ? 'would change' : 'changed'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
