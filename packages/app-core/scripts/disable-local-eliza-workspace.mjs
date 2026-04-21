#!/usr/bin/env node

/**
 * Disable the repo-local `tokagent/` workspace for CI runs that have
 * `TOKAGENT_SKIP_LOCAL_UPSTREAMS=1` set (Docker CI Smoke, Release
 * Workflow Contract, packaged build jobs, etc.).
 *
 * Three things have to happen for Bun to produce a clean lockfile when
 * `tokagent/` is absent:
 *
 *   1. The `tokagent/` directory must not exist on disk. The submodule
 *      init step already skips it in SKIP_LOCAL_UPSTREAMS mode, but if
 *      a fresh checkout DID materialize it (e.g. local repro) we also
 *      rename it out of the way here.
 *
 *   2. The root `package.json` `workspaces` array must not contain
 *      `"tokagent/packages/*"`. Leaving that glob in place while the
 *      directory is absent causes Bun 1.3.x to emit a bun.lock that
 *      carries both a workspace entry AND an npm-resolved entry for
 *      `@tokagentos/core`.
 *
 *   3. Every workspace package.json that still pins
 *      `"@tokagentos/core": "workspace:*"` must be rewritten to the same
 *      registry version that the root `overrides` block and
 *      `tokagent/packages/app-core/deploy/cloud-agent-template` already use
 *      (`@tokagentos/core@2.0.0-alpha.115` at time of writing). Without
 *      this rewrite, Bun hoists a registry-resolved `@tokagentos/core`
 *      for the workspace:* callers AND a separate registry-resolved
 *      `@tokagentos/core` for cloud-agent-template, emitting two
 *      top-level `"@tokagentos/core"` entries in bun.lock's packages
 *      section. The next `bun pm pack --dry-run` (invoked from
 *      `scripts/release-check.ts`) then fails with:
 *
 *        error: Duplicate package path
 *            at bun.lock:XXXX:5
 *        error: failed to parse lockfile: InvalidPackageKey
 *
 *      blocking the Release Workflow Contract job.
 *
 * We patch every affected file in place (no commit, CI-only). All
 * edits are idempotent and gated on `GITHUB_ACTIONS=true` +
 * `TOKAGENT_SKIP_LOCAL_UPSTREAMS=1`, so local runs and non-skip CI are
 * untouched.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOKAGENT_WORKSPACE_GLOB = "tokagent/packages/*";
export const PLUGIN_ROOT_WORKSPACE_GLOB = "tokagent/plugins/*";
export const PLUGIN_TYPESCRIPT_WORKSPACE_GLOB =
  "tokagent/plugins/plugin-*/typescript";
export const DISABLED_WORKSPACE_GLOBS = [
  TOKAGENT_WORKSPACE_GLOB,
  PLUGIN_ROOT_WORKSPACE_GLOB,
  PLUGIN_TYPESCRIPT_WORKSPACE_GLOB,
];
export const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
export const CI_LOCKFILES = ["bun.lock", "bun.lockb"];

const TOKAGENTOS_CORE_NAME = "@tokagentos/core";
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = process.cwd();

function isExactRegistryVersion(specifier) {
  return typeof specifier === "string" && /^\d+\.\d+\.\d+/.test(specifier);
}

export function isWorkspaceProtocolSpecifier(specifier) {
  return typeof specifier === "string" && specifier.startsWith("workspace:");
}

export function readPackageJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function resolvePinnedCoreVersion(
  rootDir,
  { rootPackage, readJson = readPackageJson } = {},
) {
  const fromOverrides = rootPackage?.overrides?.[TOKAGENTOS_CORE_NAME];
  if (isExactRegistryVersion(fromOverrides)) {
    return fromOverrides;
  }

  const templatePath = path.join(
    rootDir,
    "tokagent",
    "packages",
    "app-core",
    "deploy",
    "cloud-agent-template",
    "package.json",
  );
  if (fs.existsSync(templatePath)) {
    try {
      const templatePkg = readJson(templatePath);
      const fromTemplate = templatePkg?.dependencies?.[TOKAGENTOS_CORE_NAME];
      if (isExactRegistryVersion(fromTemplate)) {
        return fromTemplate;
      }
    } catch {
      // fall through
    }
  }

  return null;
}

// Persist root package.json mutations before touching sub-packages so
// the workspaces patch is written even if the core-rewrite step bails.
export function writePackageJson(filePath, originalRaw, pkg) {
  const hasTrailingNewline = originalRaw.endsWith("\n");
  const serialized =
    JSON.stringify(pkg, null, 2) + (hasTrailingNewline ? "\n" : "");
  if (serialized === originalRaw) {
    return false;
  }
  fs.writeFileSync(filePath, serialized);
  return true;
}

export function expandGlob(glob, { rootDir = DEFAULT_REPO_ROOT } = {}) {
  if (!glob.includes("*")) {
    return [glob];
  }
  const parts = glob.split("/");
  const starIndex = parts.findIndex((segment) => segment.includes("*"));
  if (starIndex === -1) {
    return [glob];
  }
  const baseSegments = parts.slice(0, starIndex);
  const base = baseSegments.length
    ? path.join(rootDir, ...baseSegments)
    : rootDir;
  if (!fs.existsSync(base)) {
    return [];
  }

  const segmentPattern = parts[starIndex];
  const tail = parts.slice(starIndex + 1);

  let entries;
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }

  const regex = new RegExp(
    "^" +
      segmentPattern
        .split("*")
        .map((chunk) => chunk.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$",
  );

  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!regex.test(entry.name)) continue;
    const relativePath = path.join(...baseSegments, entry.name);
    matches.push(tail.length ? path.join(relativePath, ...tail) : relativePath);
  }

  if (tail.length === 0) {
    return matches;
  }

  return matches.filter((match) => fs.existsSync(path.join(rootDir, match)));
}

export function resolvePinnedWorkspaceVersions(
  rootDir,
  {
    disabledWorkspaceGlobs = DISABLED_WORKSPACE_GLOBS,
    rootPackage = undefined,
    pinnedCore = resolvePinnedCoreVersion(rootDir, { rootPackage }),
  } = {},
) {
  const pinnedVersions = new Map();

  if (isExactRegistryVersion(pinnedCore)) {
    pinnedVersions.set(TOKAGENTOS_CORE_NAME, pinnedCore);
  }

  for (const [dependencyName, specifier] of Object.entries(
    rootPackage?.overrides ?? {},
  )) {
    if (isExactRegistryVersion(specifier)) {
      pinnedVersions.set(dependencyName, specifier);
    }
  }

  for (const workspaceGlob of disabledWorkspaceGlobs) {
    for (const workspaceRel of expandGlob(workspaceGlob, { rootDir })) {
      const pkgPath = path.join(rootDir, workspaceRel, "package.json");
      if (!fs.existsSync(pkgPath)) continue;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (
          typeof pkg?.name === "string" &&
          isExactRegistryVersion(pkg?.version)
        ) {
          pinnedVersions.set(pkg.name, pkg.version);
        }
      } catch {
        // Ignore malformed/partial plugin checkouts and continue.
      }
    }
  }

  return pinnedVersions;
}

export function rewriteWorkspaceDependencySpecifiers(pkg, pinnedVersions) {
  let mutated = false;
  for (const field of [...DEPENDENCY_FIELDS, "overrides"]) {
    const deps = pkg?.[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [dependencyName, specifier] of Object.entries(deps)) {
      const pinnedVersion = pinnedVersions.get(dependencyName);
      if (!pinnedVersion || !isWorkspaceProtocolSpecifier(specifier)) {
        continue;
      }
      deps[dependencyName] = pinnedVersion;
      mutated = true;
    }
  }
  return mutated;
}

export function disableLocalTokagentWorkspace(
  repoRoot = DEFAULT_REPO_ROOT,
  { log = console.log, warn = console.warn, errorLog = console.error } = {},
) {
  const tokagentRoot = path.join(repoRoot, "tokagent");
  const disabledTokagentRoot = path.join(repoRoot, ".tokagent.ci-disabled");
  const packageJsonPath = path.join(repoRoot, "package.json");
  const removedLockfiles = [];

  if (fs.existsSync(tokagentRoot)) {
    fs.rmSync(disabledTokagentRoot, { recursive: true, force: true });
    fs.renameSync(tokagentRoot, disabledTokagentRoot);
    log(
      `[disable-local-tokagent-workspace] Disabled repo-local tokagent workspace at ${tokagentRoot}`,
    );
  } else {
    log(
      "[disable-local-tokagent-workspace] Repo-local tokagent workspace already absent",
    );
  }

  if (!fs.existsSync(packageJsonPath)) {
    log(
      "[disable-local-tokagent-workspace] Root package.json not found; skipping workspace patch",
    );
    return {
      rewrites: 0,
      removedWorkspaceGlobs: [],
      pinnedWorkspaceVersions: new Map(),
    };
  }

  const rawRootPkg = fs.readFileSync(packageJsonPath, "utf8");
  let rootPkg;
  try {
    rootPkg = JSON.parse(rawRootPkg);
  } catch (error) {
    errorLog(
      `[disable-local-tokagent-workspace] Failed to parse ${packageJsonPath}: ${error.message}`,
    );
    throw error;
  }

  const removedWorkspaceGlobs = [];
  if (Array.isArray(rootPkg.workspaces)) {
    const originalWorkspaces = rootPkg.workspaces;
    const filteredWorkspaces = originalWorkspaces.filter((entry) => {
      if (DISABLED_WORKSPACE_GLOBS.includes(entry)) {
        removedWorkspaceGlobs.push(entry);
        return false;
      }
      return true;
    });

    if (removedWorkspaceGlobs.length === 0) {
      log(
        `[disable-local-tokagent-workspace] Root package.json workspaces array does not include ${DISABLED_WORKSPACE_GLOBS.join(", ")}; nothing to patch`,
      );
    } else {
      rootPkg.workspaces = filteredWorkspaces;
      log(
        `[disable-local-tokagent-workspace] Removed ${removedWorkspaceGlobs.join(", ")} from root package.json workspaces`,
      );
    }
  }

  writePackageJson(packageJsonPath, rawRootPkg, rootPkg);

  const pinnedWorkspaceVersions = resolvePinnedWorkspaceVersions(repoRoot, {
    rootPackage: rootPkg,
  });

  if (!pinnedWorkspaceVersions.has(TOKAGENTOS_CORE_NAME)) {
    warn(
      "[disable-local-tokagent-workspace] Could not resolve a pinned @tokagentos/core version from overrides or cloud-agent-template; leaving workspace:* specifiers in place",
    );
    return {
      rewrites: 0,
      removedWorkspaceGlobs,
      pinnedWorkspaceVersions,
    };
  }

  log(
    `[disable-local-tokagent-workspace] Rewriting workspace specifiers for ${pinnedWorkspaceVersions.size} package(s) to exact registry versions`,
  );

  const seen = new Set();
  const pendingWorkspaceDirs = [];

  for (const entry of rootPkg.workspaces ?? []) {
    const expanded = expandGlob(entry, { rootDir: repoRoot });
    for (const match of expanded) {
      if (!seen.has(match)) {
        seen.add(match);
        pendingWorkspaceDirs.push(match);
      }
    }
  }

  let rewrites = 0;
  if (rewriteWorkspaceDependencySpecifiers(rootPkg, pinnedWorkspaceVersions)) {
    writePackageJson(packageJsonPath, rawRootPkg, rootPkg);
    rewrites++;
    log("[disable-local-tokagent-workspace]   patched .");
  }

  for (const workspaceRel of pendingWorkspaceDirs) {
    const pkgPath = path.join(repoRoot, workspaceRel, "package.json");
    if (!fs.existsSync(pkgPath)) continue;

    let originalRaw;
    let pkg;
    try {
      originalRaw = fs.readFileSync(pkgPath, "utf8");
      pkg = JSON.parse(originalRaw);
    } catch (error) {
      warn(
        `[disable-local-tokagent-workspace]   skipped ${workspaceRel}: ${error.message}`,
      );
      continue;
    }

    if (!rewriteWorkspaceDependencySpecifiers(pkg, pinnedWorkspaceVersions)) {
      continue;
    }
    if (writePackageJson(pkgPath, originalRaw, pkg)) {
      rewrites++;
      log(`[disable-local-tokagent-workspace]   patched ${workspaceRel}`);
    }
  }

  if (rewrites === 0) {
    log(
      "[disable-local-tokagent-workspace] No disabled upstream workspace specifiers found; nothing rewritten",
    );
  } else {
    log(
      `[disable-local-tokagent-workspace] Rewrote disabled upstream workspace specifiers in ${rewrites} package.json file(s)`,
    );
  }

  for (const lockfileName of CI_LOCKFILES) {
    const lockfilePath = path.join(repoRoot, lockfileName);
    if (!fs.existsSync(lockfilePath)) continue;
    fs.rmSync(lockfilePath, { force: true });
    removedLockfiles.push(lockfileName);
  }

  if (removedLockfiles.length > 0) {
    log(
      `[disable-local-tokagent-workspace] Removed ${removedLockfiles.join(", ")} so Bun regenerates the lockfile against the rewritten workspace graph`,
    );
  }

  return {
    rewrites,
    removedWorkspaceGlobs,
    removedLockfiles,
    pinnedWorkspaceVersions,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);

if (isMain) {
  const skipLocalUpstreams =
    process.env.TOKAGENT_SKIP_LOCAL_UPSTREAMS === "1" ||
    process.env.TOKAGENT_SKIP_LOCAL_UPSTREAMS === "1";
  const runningInCi = process.env.GITHUB_ACTIONS === "true";
  const forced = process.env.TOKAGENT_DISABLE_LOCAL_UPSTREAMS === "force";

  if (!skipLocalUpstreams || (!runningInCi && !forced)) {
    process.exit(0);
  }

  try {
    disableLocalTokagentWorkspace();
  } catch {
    process.exit(1);
  }
}
