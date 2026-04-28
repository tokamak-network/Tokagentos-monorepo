import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FullstackTemplateValues,
  PluginTemplateValues,
  ProjectTemplateMetadata,
  TemplateDefinition,
  TemplateUpstream,
} from "./types.js";

const SKIP_NAMES = new Set([
  ".DS_Store",
  ".git",
  ".turbo",
  ".vite",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".gz",
  ".wasm",
  ".dylib",
  ".dll",
  ".so",
]);
/**
 * Paths inside the freshly-hydrated upstream submodule (eliza) that we always
 * remove before bun install. These pull in workspace dependencies (chiefly
 * `@elizaos/cloud-sdk`) that Tokagent does not ship and that would otherwise
 * cause `bun install` to fail with "Workspace dependency ... not found".
 *
 * - `plugins/plugin-elizacloud` declares `@elizaos/cloud-sdk: workspace:*`
 *   and is matched by the scaffolded project's `tokagent/plugins/plugin-*\/typescript`
 *   workspace glob. Removing the directory takes it out of the workspace set.
 * - `cloud` is the eliza Cloud monorepo provided as a git submodule; we don't
 *   use it. Removing it keeps `tokagent/package.json` workspace entries
 *   `cloud/packages/sdk` and `cloud/packages/services/billing` from resolving
 *   if a developer ever runs `bun install` inside `tokagent/` directly.
 */
const UPSTREAM_PRUNE_PATHS = [
  "plugins/plugin-elizacloud",
  "cloud",
] as const;

/**
 * Workspace entries inside the upstream `tokagent/package.json` that point at
 * paths we prune via UPSTREAM_PRUNE_PATHS. We strip them so the upstream
 * package.json stays internally consistent for any tooling that reads it.
 */
const UPSTREAM_WORKSPACE_REMOVALS = [
  "cloud/packages/sdk",
  "cloud/packages/services/billing",
] as const;

/**
 * Other upstream package.json files that still reference the pruned packages.
 * Removing these dep entries keeps `bun install` from re-introducing the
 * "Workspace dependency ... not found" error on the scaffolded project root.
 *
 * Each `path` is relative to the upstream submodule root. Each entry in
 * `names` is removed from `dependencies`, `devDependencies`, and
 * `peerDependencies` if present.
 */
const UPSTREAM_DEPENDENCY_REMOVALS: ReadonlyArray<{
  readonly path: string;
  readonly names: readonly string[];
}> = [
  {
    path: "packages/typescript/package.json",
    names: ["@elizaos/plugin-elizacloud"],
  },
  {
    path: "packages/app-core/deploy/cloud-agent-template/package.json",
    names: ["@elizaos/plugin-elizacloud"],
  },
  {
    // app-lifeops has workspace:* deps on messaging plugins that live in
    // submodules we deliberately don't clone (avoids `git submodule
    // update --init --recursive` failures from any single bad submodule
    // pin like the cloud/ ref-rewrite issue). Strip the deps so bun
    // install resolves; LifeOps loses messaging connectors but the
    // core (tasks, goals, calendar, inbox) keeps working.
    path: "apps/app-lifeops/package.json",
    names: [
      "@elizaos/plugin-imessage",
      "@elizaos/plugin-signal",
      "@elizaos/plugin-telegram",
      "@elizaos/plugin-whatsapp",
    ],
  },
];

/**
 * Narrow surgical edits applied to upstream eliza files after hydration.
 *
 * Use these instead of full-file scaffold-patch overlays when the change is
 * a single semantic edit and the surrounding code can be tracked verbatim
 * with upstream. Each `find` string is replaced with `replaceWith` exactly
 * once; if the find string isn't present in the upstream file, the error is
 * loud (an exception) so we know to revisit when upstream changes.
 *
 * Trade-off vs. a full-file overlay:
 *   + Almost zero divergence from upstream — easy to keep current
 *   + Forces a code review on upstream-side changes via the loud-error
 *   - Brittle if upstream reformats whitespace inside the matched span
 *
 * Use full overlays for major rewrites; use surgical patches for one-line
 * UX fixes like removing a hardcoded canned response.
 */
const UPSTREAM_SURGICAL_PATCHES: ReadonlyArray<{
  readonly path: string;
  readonly description: string;
  readonly find: string;
  readonly replaceWith: string;
}> = [
  {
    path: "packages/agent/src/api/server-helpers.ts",
    description:
      "Remove the IDENTITY-intent canned wallet-status dump. Upstream's " +
      "`/\\b(wallet\\s*address|address)\\b/i` regex matches almost any " +
      "DeFi-operator chat message ('vault address', 'contract address', " +
      "'where do I deploy', etc.) and short-circuits the LLM with a static " +
      "wallet-status block. Tokagent's persona is built around exactly " +
      "those topics so the override is hostile UX. Connectors-only and " +
      "no-wallet-execution gates above remain in place.",
    find: `  if (WALLET_IDENTITY_INTENT_RE.test(prompt)) {
    return [
      \`Wallet network: \${walletNetwork}.\`,
      walletSummary,
      \`plugin-evm: \${pluginEvmLoaded ? "loaded" : "not loaded"}.\`,
      \`Execution readiness: \${executionReady ? "ready for wallet actions" : (executionBlockedReason ?? "blocked")}.\`,
      \`Automation mode: \${automationMode}.\`,
    ].join("\\n");
  }
`,
    replaceWith:
      "  // [tokagent surgical-patch] removed IDENTITY-intent wallet-status\n" +
      "  // dump — see scaffold.ts UPSTREAM_SURGICAL_PATCHES.\n",
  },
  {
    path: "packages/agent/src/runtime/eliza.ts",
    description:
      "Add a Tokagent capability hint to the system-prompt suffix. Upstream " +
      "appends an n8n hint when the local n8n sidecar is enabled, but " +
      "doesn't mention the Tokagent plugins (perps, polymarket, yield, " +
      "strategy). Without an explicit hint, the LLM falls back to training " +
      "data and hallucinates capabilities. Seed `capabilityHints` with a " +
      "single Tokagent line so the system prompt always advertises the " +
      "Tokagent action surface.",
    find: "  const capabilityHints: string[] = [];\n",
    replaceWith:
      "  const capabilityHints: string[] = [\n" +
      "    [\n" +
      '      "You operate a Tokagent vault on Tokamak. Operating manual:",\n' +
      '      "",\n' +
      '      "1. Discover state first. If the user asks about capabilities, current strategies, or vault status, do not guess — call LIST_STRATEGIES or read the vault context block before replying.",\n' +
      '      "",\n' +
      '      "2. No-vault path. If the user asks for any strategy / trade / position and no vault is deployed yet, call DEPLOY_TOKAGENT_VAULT first (defaults: chain=hyperevm, packs match the requested kind). Confirm the chain and pack with the user in ONE message before submitting.",\n' +
      '      "",\n' +
      '      "3. With-vault path. Build with BUILD_STRATEGY, then START_STRATEGY. STOP_STRATEGY to pause. BACKTEST_STRATEGY to dry-run.",\n' +
      '      "",\n' +
      '      "4. Available kinds: yield-auto-compound (Aave USDC), polymarket-value-hunt (Polymarket markets), perp-funding-arb (Hyperliquid perps).",\n' +
      '      "",\n' +
      '      "Hard rules: never invent vault addresses, contract addresses, balances, or APRs. If you do not know a value, ask or read it from a tool. Never call action handlers with placeholder values like 0x123. Always confirm before any deploy or trade. If an action returns reason=invalid_vault_address with a hint about DEPLOY_TOKAGENT_VAULT, do that — do NOT retry with a different placeholder.",\n' +
      "    ].join(\"\\n\"),\n" +
      "  ];\n",
  },
  {
    path: "packages/agent/src/runtime/default-knowledge.ts",
    description:
      "Replace upstream's seeded Eliza knowledge with Tokagent knowledge. " +
      "Upstream seeds 3 docs into the agent's memory at boot (eliza-overview, " +
      "eliza-history, eliza-cloud-basics) describing the elizaOS chatbot. " +
      "RAG retrieval against those docs makes the agent introduce itself as " +
      "'created by Joseph Weizenbaum at MIT in the mid-1960s' — completely " +
      "off-character for a Tokagent vault operator. Replace each text " +
      "constant in-place; the doc keys/filenames stay the same so seed-by-key " +
      "deduplication continues to work across boots.",
    find:
      'export const ELIZA_OVERVIEW_TEXT =\n' +
      '  "Eliza is an autonomous agent powered by elizaOS, the agent framework. Users can ask Eliza to write code, add new skills, and trigger recurring workflows with heartbeats that run at regular intervals. Eliza Cloud is an open source cloud backend that simplifies deploying and delivering Eliza.";\n' +
      '\n' +
      'export const ELIZA_HISTORY_TEXT =\n' +
      '  "ELIZA was created by Joseph Weizenbaum at MIT in the mid-1960s and is widely regarded as one of the earliest chatbots. Its best-known script, DOCTOR, used pattern matching to imitate a Rogerian psychotherapist and showed how simple language rules could feel surprisingly conversational. ELIZA helped define the history of chatbots and influenced later work on conversational agents.";\n' +
      '\n' +
      'export const ELIZA_CLOUD_BASICS_TEXT =\n' +
      '  "Eliza Cloud is the managed backend and app platform for Eliza when cloud mode is enabled. Builders can create an app, keep its appId, use Cloud login and redirect flows so app users can authenticate against Cloud, route chat and media APIs through Cloud, monetize app usage with inference markup and purchase-share settings, and deploy Docker containers when an app needs server-side execution.";\n',
    replaceWith:
      'export const ELIZA_OVERVIEW_TEXT =\n' +
      '  "Tokagent is a DeFi vault operator built on Tokamak. It runs automated strategies — perpetual trading on Hyperliquid, prediction markets on Polymarket, and yield rebalancing through Aave — out of an on-chain vault that the operator controls. The agent reads market state from tools, sizes positions against available collateral, and routes every write through the vault\'s allowlisted batch executor.";\n' +
      '\n' +
      'export const ELIZA_HISTORY_TEXT =\n' +
      '  "Tokagent is built on top of elizaOS, an open-source agent framework. The Tokagent product layer adds four plugins: tokagent-strategy (BUILD_STRATEGY, DEPLOY_TOKAGENT_VAULT, list/start/stop, backtest), tokagent-perps (Hyperliquid perpetual trading via vault allowlist), tokagent-polymarket (Polymarket buy/sell/redeem via vault allowlist), and tokagent-yield (Aave deposit/withdraw via vault allowlist). The agent uses these plugins to compose, deploy, and run strategies from chat.";\n' +
      '\n' +
      'export const ELIZA_CLOUD_BASICS_TEXT =\n' +
      '  "A Tokagent vault is an on-chain smart contract on Tokamak that holds operator capital and routes writes through an allowlisted batch executor. The agent never signs freelance transactions from the hot wallet by default; instead it submits batches to the vault, which validates them against the allowlist before execution. Operators can deploy a new vault from chat using the DEPLOY_TOKAGENT_VAULT action, then attach strategies (perps, polymarket, yield) to that vault.";\n',
  },
];

const UPSTREAM_COMPATIBILITY_FILES = [
  {
    path: "packages/shared/src/env-utils.impl.d.ts",
    sourceSibling: "packages/shared/src/env-utils.impl.ts",
    contents:
      "export declare function isTruthyEnvValue(value: string | undefined | null): boolean;\n",
  },
  {
    path: "packages/shared/src/env-utils.impl.js",
    sourceSibling: "packages/shared/src/env-utils.impl.ts",
    contents: `/**
 * Shared environment variable utilities (JavaScript module so Node ESM can resolve
 * \`./env-utils.impl.js\` when workspace packages load TypeScript sources directly).
 */

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/**
 * Returns true when value is a commonly-accepted truthy env string
 * (\`1\`, \`true\`, \`yes\`, \`on\` — case-insensitive, trimmed).
 * @param {string | undefined | null} value
 * @returns {boolean}
 */
export function isTruthyEnvValue(value) {
  if (value == null) return false;
  return TRUTHY.has(String(value).trim().toLowerCase());
}
`,
  },
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function ensureGitRepository(projectRoot: string): void {
  const gitDir = path.join(projectRoot, ".git");
  if (!fs.existsSync(gitDir)) {
    execFileSync("git", ["init", "-q"], { cwd: projectRoot });
  }
}

function isLocalRepoSpec(repo: string): boolean {
  return (
    path.isAbsolute(repo) ||
    repo.startsWith("./") ||
    repo.startsWith("../") ||
    repo.startsWith("file://")
  );
}

function withOptionalFileProtocol(repo: string, args: string[]): string[] {
  if (!isLocalRepoSpec(repo)) {
    return args;
  }
  return ["-c", "protocol.file.allow=always", ...args];
}

function resolveLocalRepoRoot(repo: string): string | undefined {
  if (!isLocalRepoSpec(repo)) {
    return undefined;
  }
  if (repo.startsWith("file://")) {
    return fileURLToPath(repo);
  }
  return path.resolve(repo);
}

function isBinaryFile(filePath: string, buffer: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return true;
  }
  return buffer.includes(0);
}

function replaceAll(
  text: string,
  replacements: Array<[string, string]>,
): string {
  let next = text;
  for (const [from, to] of replacements.sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    next = next.split(from).join(to);
  }
  return next;
}

function normalizeKebabCase(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "project";
}

export function toDisplayName(value: string): string {
  return normalizeKebabCase(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildPluginTemplateValues(input: {
  tokagentVersion: string;
  githubUsername: string;
  pluginDescription: string;
  projectName: string;
  repoUrl: string;
}): PluginTemplateValues {
  const slug = normalizeKebabCase(input.projectName);
  const pluginBaseName = slug.startsWith("plugin-") ? slug : `plugin-${slug}`;
  return {
    displayName: toDisplayName(pluginBaseName.replace(/^plugin-/, "")),
    tokagentVersion: input.tokagentVersion,
    githubUsername: input.githubUsername,
    pluginBaseName,
    pluginDescription: input.pluginDescription,
    pluginSnake: pluginBaseName.replace(/-/g, "_"),
    repoUrl: input.repoUrl,
  };
}

export function buildFullstackTemplateValues(
  projectName: string,
): FullstackTemplateValues {
  const projectSlug = normalizeKebabCase(projectName);
  const packageScope = projectSlug.replace(/[^a-z0-9]/g, "");
  const appName = toDisplayName(projectSlug);
  const appUrl = `https://example.com/${projectSlug}`;
  return {
    appName,
    appUrl,
    bugReportUrl: `https://github.com/your-org/${projectSlug}/issues/new`,
    bundleId: `com.example.${packageScope || "app"}`,
    docsUrl: `${appUrl}/docs`,
    fileExtension: `.${projectSlug}.agent`,
    hashtag: `#${appName.replace(/\s+/g, "")}`,
    orgName: "your-org",
    packageScope: packageScope || "app",
    projectSlug,
    releaseBaseUrl: `${appUrl}/releases/`,
    repoName: projectSlug,
  };
}

export function getPluginReplacementEntries(
  values: PluginTemplateValues,
): Array<[string, string]> {
  const rustPluginName = `rust-${values.pluginBaseName}`;
  const pythonPluginName = `python-${values.pluginBaseName}`;
  const pythonSnake = `python_${values.pluginSnake}`;
  return [
    [`\${PLUGINNAME}`, values.pluginBaseName],
    [`\${PLUGINDESCRIPTION}`, values.pluginDescription],
    [`\${GITHUB_USERNAME}`, values.githubUsername],
    [`\${REPO_URL}`, values.repoUrl],
    ["__TOKAGENTOS_VERSION__", values.tokagentVersion],
    ["@tokagentos/rust-plugin-starter", `@tokagentos/${rustPluginName}`],
    ["@elizaos/plugin-starter", `@tokagentos/${values.pluginBaseName}`],
    ["tokagentos_plugin_starter", `tokagentos_${values.pluginSnake}`],
    ["tokagentos-plugin-starter", `tokagentos-${values.pluginBaseName}`],
    ["rust_plugin_starter", `rust_${values.pluginSnake}`],
    ["python_plugin_starter", pythonSnake],
    ["rust-plugin-starter", rustPluginName],
    ["python-plugin-starter", pythonPluginName],
    ["plugin_starter", values.pluginSnake],
    ["plugin-starter", values.pluginBaseName],
    ["Plugin starter", `${values.displayName} plugin`],
    ["plugin starter", `${values.displayName.toLowerCase()} plugin`],
    [
      "plugin starter template",
      `${values.displayName.toLowerCase()} plugin template`,
    ],
  ];
}

export function getFullstackReplacementEntries(
  values: FullstackTemplateValues,
): Array<[string, string]> {
  return [
    ["__PROJECT_SLUG__", values.projectSlug],
    ["__APP_NAME__", values.appName],
    ["__APP_PACKAGE_NAME__", `${values.projectSlug}-app`],
    ["__ELECTROBUN_PACKAGE_NAME__", `${values.projectSlug}-electrobun`],
    ["__APP_URL__", values.appUrl],
    ["__BUG_REPORT_URL__", values.bugReportUrl],
    ["__BUNDLE_ID__", values.bundleId],
    ["__DOCS_URL__", values.docsUrl],
    ["__FILE_EXTENSION__", values.fileExtension],
    ["__HASHTAG__", values.hashtag],
    ["__ORG_NAME__", values.orgName],
    ["__PACKAGE_SCOPE__", values.packageScope],
    ["__RELEASE_BASE_URL__", values.releaseBaseUrl],
    ["__REPO_NAME__", values.repoName],
  ];
}

export function getTemplateReplacementEntries(options: {
  templateId: TemplateDefinition["id"];
  values: Record<string, string>;
}): Array<[string, string]> {
  if (options.templateId === "plugin") {
    return getPluginReplacementEntries(
      options.values as unknown as PluginTemplateValues,
    );
  }
  return getFullstackReplacementEntries(
    options.values as unknown as FullstackTemplateValues,
  );
}

export function resolveTemplateSourceDir(options: {
  language?: string;
  template: TemplateDefinition;
  templatesDir: string;
}): string {
  const templateRoot = path.join(options.templatesDir, options.template.id);
  if (options.template.id !== "plugin") {
    return templateRoot;
  }
  return path.join(templateRoot, options.language ?? "typescript");
}

function copyRenderedTreeInternal(
  sourceDir: string,
  destinationDir: string,
  replacements: Array<[string, string]>,
  managedFiles: Record<string, string>,
  rootDir: string,
): void {
  fs.mkdirSync(destinationDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name) || entry.name === "template.json") {
      continue;
    }

    const renderedEntryName = replaceAll(entry.name, replacements);
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, renderedEntryName);
    if (entry.isDirectory()) {
      copyRenderedTreeInternal(
        sourcePath,
        destinationPath,
        replacements,
        managedFiles,
        rootDir,
      );
      continue;
    }

    const relativePath = path.relative(rootDir, destinationPath);
    const buffer = fs.readFileSync(sourcePath);
    if (isBinaryFile(sourcePath, buffer)) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(destinationPath, buffer);
      managedFiles[relativePath] = sha256(buffer);
      continue;
    }

    const rendered = replaceAll(buffer.toString("utf-8"), replacements);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, rendered, "utf-8");
    managedFiles[relativePath] = sha256(rendered);
  }
}

export function renderTemplateTree(options: {
  destinationDir: string;
  replacements: Array<[string, string]>;
  sourceDir: string;
}): Record<string, string> {
  const managedFiles: Record<string, string> = {};
  copyRenderedTreeInternal(
    options.sourceDir,
    options.destinationDir,
    options.replacements,
    managedFiles,
    options.destinationDir,
  );
  return managedFiles;
}

export function createRenderedTempDir(options: {
  replacements: Array<[string, string]>;
  sourceDir: string;
}): { dir: string; managedFiles: Record<string, string> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokagentos-template-"));
  const managedFiles = renderTemplateTree({
    destinationDir: dir,
    replacements: options.replacements,
    sourceDir: options.sourceDir,
  });
  return { dir, managedFiles };
}

export function resolveTemplateUpstream(
  upstream: TemplateUpstream,
): TemplateUpstream {
  const hasEnvBranch = Object.hasOwn(process.env, "TOKAGENTOS_UPSTREAM_BRANCH");
  const envRepo = process.env.TOKAGENTOS_UPSTREAM_REPO?.trim();
  const envBranch = process.env.TOKAGENTOS_UPSTREAM_BRANCH?.trim();
  return {
    ...upstream,
    branch: hasEnvBranch ? envBranch || undefined : upstream.branch,
    repo: envRepo || upstream.repo,
  };
}

export function ensurePackageJsonWorkspaces(
  packageJsonPath: string,
  workspaceEntries: string[],
): boolean {
  if (workspaceEntries.length === 0 || !fs.existsSync(packageJsonPath)) {
    return false;
  }

  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw) as { workspaces?: string[] };
  if (!Array.isArray(pkg.workspaces)) {
    return false;
  }

  let changed = false;
  for (const entry of workspaceEntries) {
    if (!pkg.workspaces.includes(entry)) {
      pkg.workspaces.push(entry);
      changed = true;
    }
  }

  if (!changed) {
    return false;
  }

  const indent = raw.match(/^(\s+)"/m)?.[1] || "  ";
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(pkg, null, indent)}\n`,
    "utf8",
  );
  return true;
}

export function removePackageJsonWorkspaces(
  packageJsonPath: string,
  workspaceEntries: readonly string[],
): boolean {
  if (workspaceEntries.length === 0 || !fs.existsSync(packageJsonPath)) {
    return false;
  }

  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw) as { workspaces?: string[] };
  if (!Array.isArray(pkg.workspaces)) {
    return false;
  }

  const removalSet = new Set(workspaceEntries);
  const filtered = pkg.workspaces.filter((entry) => !removalSet.has(entry));
  if (filtered.length === pkg.workspaces.length) {
    return false;
  }

  pkg.workspaces = filtered;
  const indent = raw.match(/^(\s+)"/m)?.[1] || "  ";
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(pkg, null, indent)}\n`,
    "utf8",
  );
  return true;
}

/**
 * Remove upstream paths that pull in workspace dependencies Tokagent does not
 * ship. Called after `git submodule update --init --recursive` hydrates the
 * upstream tree but before bun install runs. Returns the list of paths that
 * were actually removed so the caller can log them.
 *
 * The upstream submodule is freshly cloned and is not part of the user's
 * commit history, so a plain rmSync is safe — there is no working-tree state
 * to preserve.
 */
/**
 * Strip the named entries from `dependencies`, `devDependencies`, and
 * `peerDependencies` in a package.json. Returns true if any removal occurred.
 * Used to scrub references to packages that we prune from the upstream tree
 * (e.g., `@elizaos/plugin-elizacloud`) so bun install doesn't fail trying
 * to resolve them as workspace deps.
 */
export function removePackageJsonDependencies(
  packageJsonPath: string,
  depNames: readonly string[],
): boolean {
  if (depNames.length === 0 || !fs.existsSync(packageJsonPath)) {
    return false;
  }

  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw) as Record<string, unknown>;

  let changed = false;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const block = pkg[field];
    if (block && typeof block === "object" && !Array.isArray(block)) {
      const map = block as Record<string, string>;
      for (const name of depNames) {
        if (Object.hasOwn(map, name)) {
          delete map[name];
          changed = true;
        }
      }
    }
  }

  if (!changed) {
    return false;
  }

  const indent = raw.match(/^(\s+)"/m)?.[1] || "  ";
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(pkg, null, indent)}\n`,
    "utf8",
  );
  return true;
}

/**
 * Apply all configured `UPSTREAM_DEPENDENCY_REMOVALS` against the freshly
 * hydrated upstream tree. Returns the list of package.json files that were
 * actually modified.
 */
export function pruneUpstreamPackageDependencies(
  submoduleRoot: string,
  removals: ReadonlyArray<{
    readonly path: string;
    readonly names: readonly string[];
  }> = UPSTREAM_DEPENDENCY_REMOVALS,
): string[] {
  const modified: string[] = [];
  for (const { path: relPath, names } of removals) {
    const target = path.join(submoduleRoot, relPath);
    if (removePackageJsonDependencies(target, names)) {
      modified.push(relPath);
    }
  }
  return modified;
}

/**
 * Strip `[submodule "<path>"] ... path = <path>` blocks out of the
 * upstream `.gitmodules` for the given submodule paths, so subsequent
 * `git submodule update --init --recursive` calls don't try to clone
 * them. Used to avoid fetching the cloud/ submodule whose pinned ref
 * is force-rewritten periodically and breaks scaffolds.
 *
 * If `.gitmodules` is missing or the entries aren't present, no-op.
 */
export function removeSubmodulesFromGitmodules(
  submoduleRoot: string,
  paths: readonly string[],
): void {
  const gitmodulesPath = path.join(submoduleRoot, ".gitmodules");
  if (!fs.existsSync(gitmodulesPath)) return;

  // Order matters: git operations read .gitmodules to look up submodule
  // info, so we must run them BEFORE we rewrite the file. Sequence:
  //   1. `git rm --cached <path>` — remove from git's index (still works
  //      because .gitmodules still has the entry).
  //   2. `git config --remove-section submodule.<path>` — drop cached
  //      .git/config entries.
  //   3. Rewrite .gitmodules to drop the [submodule "<path>"] block.
  //
  // After all three, git no longer knows about the submodule from any
  // angle, and `submodule update --init --recursive` won't try to fetch
  // its URL.
  for (const submodulePath of paths) {
    try {
      execFileSync(
        "git",
        ["rm", "--cached", "-rf", "--quiet", submodulePath],
        { cwd: submoduleRoot, stdio: "ignore" },
      );
    } catch {
      // Path not in index (e.g., already removed) — fine.
    }
    try {
      execFileSync(
        "git",
        ["config", "--remove-section", `submodule.${submodulePath}`],
        { cwd: submoduleRoot, stdio: "ignore" },
      );
    } catch {
      // No section configured yet — fine.
    }
  }

  // Now rewrite .gitmodules. Parse line-by-line as INI-ish: each
  // `[submodule "..."]` header starts a new block that runs until the
  // next header (or EOF). Drop blocks whose `path = ...` matches a
  // prune path; emit the rest.
  const lines = fs.readFileSync(gitmodulesPath, "utf8").split("\n");
  const removalSet = new Set(paths);

  type Block = { headerLine: string | null; bodyLines: string[]; path: string | null };
  const blocks: Block[] = [];
  let current: Block = { headerLine: null, bodyLines: [], path: null };

  const isSubmoduleHeader = (line: string) =>
    /^\[submodule\s+"/.test(line.trim());

  for (const line of lines) {
    if (isSubmoduleHeader(line)) {
      blocks.push(current);
      current = { headerLine: line, bodyLines: [], path: null };
      continue;
    }
    if (current.headerLine !== null) {
      const m = /^\s*path\s*=\s*(.+?)\s*$/.exec(line);
      if (m) current.path = m[1];
    }
    current.bodyLines.push(line);
  }
  blocks.push(current);

  let changed = false;
  const kept: Block[] = [];
  for (const block of blocks) {
    if (block.headerLine !== null && block.path && removalSet.has(block.path)) {
      changed = true;
      continue;
    }
    kept.push(block);
  }

  if (!changed) return;

  const out: string[] = [];
  for (const block of kept) {
    if (block.headerLine !== null) out.push(block.headerLine);
    out.push(...block.bodyLines);
  }
  fs.writeFileSync(gitmodulesPath, out.join("\n"), "utf8");
}

export function pruneUpstreamUnusedPaths(
  submoduleRoot: string,
  paths: readonly string[] = UPSTREAM_PRUNE_PATHS,
): string[] {
  const removed: string[] = [];

  for (const relativePath of paths) {
    const targetPath = path.join(submoduleRoot, relativePath);
    if (!fs.existsSync(targetPath)) {
      continue;
    }
    fs.rmSync(targetPath, { force: true, recursive: true });
    removed.push(relativePath);
  }

  return removed;
}

/**
 * Apply each `UPSTREAM_SURGICAL_PATCHES` entry as a literal find/replace on
 * the named upstream file. Throws if a patch's `find` string isn't present
 * (so we can't silently ship an unapplied surgical patch when upstream
 * shifts the surrounding code). Returns the list of paths actually edited.
 */
export function applyUpstreamSurgicalPatches(
  submoduleRoot: string,
  patches: ReadonlyArray<{
    readonly path: string;
    readonly description: string;
    readonly find: string;
    readonly replaceWith: string;
  }> = UPSTREAM_SURGICAL_PATCHES,
): string[] {
  const applied: string[] = [];
  for (const patch of patches) {
    const target = path.join(submoduleRoot, patch.path);
    if (!fs.existsSync(target)) {
      throw new Error(
        `[surgical-patch] target file missing: ${patch.path}\n` +
          `Patch description: ${patch.description}`,
      );
    }
    const before = fs.readFileSync(target, "utf8");
    if (!before.includes(patch.find)) {
      throw new Error(
        `[surgical-patch] find-string not present in ${patch.path}.\n` +
          `Upstream may have changed the matched span. Patch description:\n` +
          `  ${patch.description}\n` +
          `First 80 chars of find:\n  ${patch.find.slice(0, 80).replace(/\n/g, "\\n")}…`,
      );
    }
    // Single replacement — split-then-join asserts uniqueness of the match.
    const segments = before.split(patch.find);
    if (segments.length !== 2) {
      throw new Error(
        `[surgical-patch] find-string matched ${segments.length - 1} times in ${patch.path}; expected exactly 1.`,
      );
    }
    const after = segments.join(patch.replaceWith);
    fs.writeFileSync(target, after, "utf8");
    applied.push(patch.path);
  }
  return applied;
}

export function ensureUpstreamCompatibilityFiles(
  submoduleRoot: string,
): string[] {
  const created: string[] = [];

  for (const file of UPSTREAM_COMPATIBILITY_FILES) {
    const targetPath = path.join(submoduleRoot, file.path);
    if (fs.existsSync(targetPath)) {
      continue;
    }

    const sourceSiblingPath = path.join(submoduleRoot, file.sourceSibling);
    if (!fs.existsSync(sourceSiblingPath)) {
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, file.contents, "utf8");
    created.push(file.path);
  }

  return created;
}

export function buildMetadata(options: {
  cliVersion: string;
  language?: string;
  managedFiles: Record<string, string>;
  template: TemplateDefinition;
  values: Record<string, string>;
}): ProjectTemplateMetadata {
  const now = new Date().toISOString();
  return {
    cliVersion: options.cliVersion,
    createdAt: now,
    language: options.language,
    managedFiles: options.managedFiles,
    templateId: options.template.id,
    templateVersion: options.template.version,
    updatedAt: now,
    values: options.values,
  };
}

export function updateManagedFiles(options: {
  currentMetadata: ProjectTemplateMetadata;
  dryRun?: boolean;
  projectRoot: string;
  renderedDir: string;
  renderedManagedFiles: Record<string, string>;
}): {
  conflicts: string[];
  created: string[];
  deleted: string[];
  nextManagedFiles: Record<string, string>;
  unchanged: string[];
  updated: string[];
} {
  const conflicts: string[] = [];
  const created: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];
  const updated: string[] = [];
  const nextManagedFiles = { ...options.renderedManagedFiles };

  const previousFiles = options.currentMetadata.managedFiles;
  const allManagedPaths = new Set([
    ...Object.keys(previousFiles),
    ...Object.keys(options.renderedManagedFiles),
  ]);

  for (const relativePath of allManagedPaths) {
    const projectPath = path.join(options.projectRoot, relativePath);
    const renderedPath = path.join(options.renderedDir, relativePath);
    const previousHash = previousFiles[relativePath];
    const nextHash = options.renderedManagedFiles[relativePath];
    const hasCurrentFile = fs.existsSync(projectPath);
    const hasRenderedFile = fs.existsSync(renderedPath);
    const currentHash = hasCurrentFile
      ? sha256(fs.readFileSync(projectPath))
      : "";

    if (previousHash && !hasRenderedFile) {
      if (currentHash && currentHash !== previousHash) {
        conflicts.push(relativePath);
        delete nextManagedFiles[relativePath];
        continue;
      }
      deleted.push(relativePath);
      delete nextManagedFiles[relativePath];
      if (!options.dryRun && fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { force: true });
      }
      continue;
    }

    if (!previousHash && nextHash) {
      if (currentHash && currentHash !== nextHash) {
        conflicts.push(relativePath);
        continue;
      }
      created.push(relativePath);
      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(projectPath), { recursive: true });
        fs.copyFileSync(renderedPath, projectPath);
      }
      continue;
    }

    if (currentHash === previousHash) {
      if (currentHash === nextHash) {
        unchanged.push(relativePath);
        continue;
      }
      updated.push(relativePath);
      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(projectPath), { recursive: true });
        fs.copyFileSync(renderedPath, projectPath);
      }
      continue;
    }

    if (currentHash === nextHash) {
      unchanged.push(relativePath);
      continue;
    }

    conflicts.push(relativePath);
    delete nextManagedFiles[relativePath];
  }

  return {
    conflicts,
    created,
    deleted,
    nextManagedFiles,
    unchanged,
    updated,
  };
}

export function hydrateGitSubmoduleWorkspace(options: {
  dryRun?: boolean;
  projectRoot: string;
  upstream: TemplateUpstream;
}): void {
  if (options.dryRun) {
    return;
  }

  const submoduleRoot = path.join(options.projectRoot, options.upstream.path);
  if (!fs.existsSync(submoduleRoot)) {
    return;
  }

  // Upstream elizaos/eliza hardcodes `eliza/packages/...` paths in a
  // few runtime scripts (e.g., dev-ui.mjs spawning the dev-server). Our
  // template puts the submodule under `tokagent/` instead, so those
  // hardcoded paths would 404 at runtime. Create an `eliza` symlink
  // pointing at the submodule path so either name resolves.
  if (options.upstream.path !== "eliza") {
    const elizaAlias = path.join(options.projectRoot, "eliza");
    if (!fs.existsSync(elizaAlias)) {
      try {
        fs.symlinkSync(options.upstream.path, elizaAlias, "dir");
      } catch {
        // Non-fatal — upstream scripts that rely on the alias will
        // surface their own errors later if the symlink couldn't be
        // created (e.g., on filesystems that don't support symlinks).
      }
    }
  }

  const requiredSubmodules = options.upstream.requiredSubmodules ?? [];
  const localRepoRoot = resolveLocalRepoRoot(options.upstream.repo);

  // Strip the always-prune submodules out of .gitmodules BEFORE recursive
  // init. Particularly important for `cloud/` — upstream eliza pins a
  // commit on elizaOS/cloud that gets force-rewritten periodically, so
  // `git submodule update --init --recursive` fails with `not our ref`.
  // Since we delete those paths anyway via pruneUpstreamUnusedPaths,
  // skip cloning them.
  removeSubmodulesFromGitmodules(submoduleRoot, UPSTREAM_PRUNE_PATHS);

  // Init ALL remaining submodules recursively. The agent runtime
  // statically imports from many plugin submodules (plugin-agent-skills,
  // plugin-commands, plugin-cron, plugin-app-control, plugin-shell,
  // app-lifeops, plugin-browser-bridge, plugin-app-companion, …) so
  // skipping them breaks runtime imports. Tolerate failures here:
  // a transient submodule fetch error shouldn't block scaffold creation.
  // The required-submodule loop below re-attempts each explicitly.
  try {
    execFileSync(
      "git",
      ["submodule", "update", "--init", "--recursive"],
      { cwd: submoduleRoot, stdio: "inherit" },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[scaffold] recursive submodule init reported errors — continuing. ` +
        `Required submodules will be re-fetched individually below. ` +
        `Underlying error: ${msg.split("\n")[0]}`,
    );
  }

  for (const submodulePath of requiredSubmodules) {
    const command = ["submodule", "update", "--init", "--recursive"];
    let localSubmoduleRoot: string | undefined;

    if (localRepoRoot) {
      const candidate = path.join(localRepoRoot, submodulePath);
      if (fs.existsSync(candidate)) {
        execFileSync(
          "git",
          ["config", `submodule.${submodulePath}.url`, candidate],
          { cwd: submoduleRoot, stdio: "inherit" },
        );
        localSubmoduleRoot = candidate;
      }
    }

    if (localSubmoduleRoot) {
      command.push("--reference", localSubmoduleRoot);
    }
    command.push(submodulePath);
    try {
      execFileSync(
        "git",
        localSubmoduleRoot
          ? withOptionalFileProtocol(localSubmoduleRoot, command)
          : command,
        { cwd: submoduleRoot, stdio: "inherit" },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[scaffold] failed to init required submodule "${submodulePath}" — ` +
          `continuing. Some plugin functionality may be unavailable until ` +
          `the user runs "git submodule update --init ${submodulePath}" ` +
          `manually inside ${options.upstream.path}/. ` +
          `Underlying error: ${msg.split("\n")[0]}`,
      );
    }
  }

  // Drop upstream paths whose workspace dependencies aren't satisfiable in a
  // Tokagent scaffold (chiefly plugin-elizacloud, which references the
  // private `@elizaos/cloud-sdk` workspace). Then scrub leftover references
  // to those packages from sibling package.json files. Run before the
  // workspace package.json edits so the upstream package.json stays
  // consistent with the pruned tree.
  pruneUpstreamUnusedPaths(submoduleRoot);
  removePackageJsonWorkspaces(
    path.join(submoduleRoot, "package.json"),
    UPSTREAM_WORKSPACE_REMOVALS,
  );
  pruneUpstreamPackageDependencies(submoduleRoot);

  ensurePackageJsonWorkspaces(
    path.join(submoduleRoot, "package.json"),
    options.upstream.requiredWorkspaces ?? [],
  );
  ensureUpstreamCompatibilityFiles(submoduleRoot);

  const patchResult = applyTokagentScaffoldPatches({
    dryRun: options.dryRun,
    submoduleRoot,
  });

  if (patchResult.missing.length > 0) {
    // Missing target dirs are expected when an upstream submodule failed
    // to clone (e.g., transient network error or a force-rewritten ref).
    // Warn but don't crash — the user can re-run if a critical patch was
    // skipped, and overlays for unrelated submodules don't need to block
    // scaffold creation.
    console.warn(
      `[scaffold-patches] Target paths missing — likely an upstream ` +
        `submodule didn't clone successfully. Skipping these overlays:\n  - ` +
        patchResult.missing.join("\n  - "),
    );
  }

  // Narrow surgical edits over the upstream files (post-overlay so they
  // can patch files we don't otherwise overlay). Throws loudly if the find
  // string drifted.
  if (!options.dryRun) {
    applyUpstreamSurgicalPatches(submoduleRoot);
  }
}

/**
 * Overlay Tokagent-specific patches onto a freshly-hydrated upstream clone.
 * Each file under `scaffold-patches/` is copied to the same relative path
 * inside `<submoduleRoot>/` (i.e., the user's `<project>/tokagent/` directory).
 *
 * Returns a list of relative paths that were overlaid so the caller can log
 * them. Conflicts (target path missing) throw with a clear error — upstream
 * reorganizations must be reconciled in scaffold-patches before the next
 * tokagentos release.
 */
export function applyTokagentScaffoldPatches(options: {
  dryRun?: boolean;
  submoduleRoot: string;
}): { applied: string[]; missing: string[] } {
  const applied: string[] = [];
  const missing: string[] = [];

  const patchesRoot = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "scaffold-patches",
  );

  if (!fs.existsSync(patchesRoot)) {
    // No patches declared — nothing to do.
    return { applied, missing };
  }

  const walk = (dir: string): string[] => {
    const entries: string[] = [];
    for (const name of fs.readdirSync(dir)) {
      if (SKIP_NAMES.has(name)) continue;
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        entries.push(...walk(full));
      } else if (stat.isFile()) {
        entries.push(full);
      }
    }
    return entries;
  };

  const patchFiles = walk(patchesRoot);

  for (const patchPath of patchFiles) {
    const relativePath = path.relative(patchesRoot, patchPath);
    // Exclude README.md from being overlaid — it's documentation.
    if (relativePath === "README.md") continue;

    const targetPath = path.join(options.submoduleRoot, relativePath);

    if (!fs.existsSync(path.dirname(targetPath))) {
      // Target parent dir missing — upstream layout may have changed.
      missing.push(relativePath);
      continue;
    }

    if (options.dryRun) {
      applied.push(relativePath);
      continue;
    }

    fs.copyFileSync(patchPath, targetPath);
    applied.push(relativePath);
  }

  return { applied, missing };
}

export function initializeGitSubmodule(options: {
  branch?: string;
  projectRoot: string;
  repo: string;
  submodulePath: string;
}): void {
  ensureGitRepository(options.projectRoot);

  const submoduleRoot = path.join(options.projectRoot, options.submodulePath);
  if (fs.existsSync(submoduleRoot)) {
    return;
  }

  const args = ["submodule", "add", "--depth", "1"];
  const localRepoRoot = resolveLocalRepoRoot(options.repo);
  if (localRepoRoot) {
    args.push("--reference", localRepoRoot);
  }
  if (options.branch?.trim()) {
    args.push("-b", options.branch.trim());
  }
  args.push(options.repo, options.submodulePath);
  execFileSync("git", withOptionalFileProtocol(options.repo, args), {
    cwd: options.projectRoot,
    stdio: "inherit",
  });
}

export function updateGitSubmodule(options: {
  branch?: string;
  dryRun?: boolean;
  projectRoot: string;
  repo: string;
  submodulePath: string;
}): void {
  if (options.dryRun) {
    return;
  }

  ensureGitRepository(options.projectRoot);
  const submoduleRoot = path.join(options.projectRoot, options.submodulePath);
  if (!fs.existsSync(submoduleRoot)) {
    initializeGitSubmodule({
      branch: options.branch,
      projectRoot: options.projectRoot,
      repo: options.repo,
      submodulePath: options.submodulePath,
    });
    return;
  }

  const localRepoRoot = resolveLocalRepoRoot(options.repo);
  execFileSync(
    "git",
    withOptionalFileProtocol(options.repo, [
      "submodule",
      "update",
      "--init",
      "--remote",
      ...(localRepoRoot ? ["--reference", localRepoRoot] : []),
      options.submodulePath,
    ]),
    { cwd: options.projectRoot, stdio: "inherit" },
  );
}
