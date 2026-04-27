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

  // Init ALL submodules recursively first so the upstream package's
  // transitive workspace:* deps (plugins listed in upstream/package.json
  // but not explicitly in requiredSubmodules) resolve. The per-path loop
  // below then re-runs with optional --reference against a local fork.
  execFileSync(
    "git",
    ["submodule", "update", "--init", "--recursive"],
    { cwd: submoduleRoot, stdio: "inherit" },
  );

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
    execFileSync(
      "git",
      localSubmoduleRoot
        ? withOptionalFileProtocol(localSubmoduleRoot, command)
        : command,
      { cwd: submoduleRoot, stdio: "inherit" },
    );
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
    throw new Error(
      `scaffold-patches target paths missing — upstream reorganization? ` +
        `Missing: ${patchResult.missing.join(", ")}`,
    );
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
