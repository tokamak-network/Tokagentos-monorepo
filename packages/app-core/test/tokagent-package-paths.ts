import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const skipLocalUpstreams =
  process.env.TOKAGENT_SKIP_LOCAL_UPSTREAMS === "1" ||
  process.env.TOKAGENT_SKIP_LOCAL_UPSTREAMS === "1";

function getRepoLocalWorkspaceRoot(
  packageName: string,
  repoRoot: string,
): string | undefined {
  if (skipLocalUpstreams) {
    return undefined;
  }

  if (packageName === "@tokagentos/core") {
    return getRepoLocalTokagentCoreRoot(packageName, repoRoot);
  }

  const relativeRoots: Record<string, string[]> = {
    "@tokagentos/agent": ["tokagent/packages/agent", "../tokagent/packages/agent"],
    "@tokagentos/app-core": [
      "tokagent/packages/app-core",
      "../tokagent/packages/app-core",
    ],
    "@tokagentos/shared": ["tokagent/packages/shared", "../tokagent/packages/shared"],
    "@tokagentos/app-companion": [
      "tokagent/apps/app-companion",
      "../tokagent/apps/app-companion",
    ],
  };

  for (const relativeRoot of relativeRoots[packageName] ?? []) {
    const candidate = path.resolve(repoRoot, relativeRoot);
    if (existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Return the repo-local tokagent core workspace root when it is checked out as
 * part of the Tokagent repo. This avoids relying on node_modules symlinks which
 * Bun can rewrite differently across fresh CI installs.
 */
function getRepoLocalTokagentCoreRoot(
  packageName: string,
  repoRoot: string,
): string | undefined {
  if (packageName !== "@tokagentos/core" || skipLocalUpstreams) {
    return undefined;
  }

  const tokagentRoots = [
    path.resolve(repoRoot, "tokagent"),
    path.resolve(repoRoot, "..", "tokagent"),
  ];

  for (const tokagentRoot of tokagentRoots) {
    if (!existsSync(path.join(tokagentRoot, "package.json"))) {
      continue;
    }

    const candidate = path.join(tokagentRoot, "packages", "typescript");
    if (!existsSync(path.join(candidate, "package.json"))) {
      continue;
    }

    // Require both a source entry AND installed dependencies. CI checks out the
    // submodule (submodules: recursive) but skips its dependency install
    // (TOKAGENT_SKIP_LOCAL_UPSTREAMS=1), so the source exists but imports of
    // transitive deps like 'dedent' or 'adze' fail at runtime.
    const hasSource =
      existsSync(path.join(candidate, "dist", "node", "index.node.js")) ||
      existsSync(path.join(candidate, "dist", "index.js")) ||
      existsSync(path.join(candidate, "src", "index.node.ts")) ||
      existsSync(path.join(candidate, "src", "index.ts")) ||
      existsSync(path.join(candidate, "index.node.ts")) ||
      existsSync(path.join(candidate, "index.ts"));
    const hasDeps = existsSync(path.join(candidate, "node_modules"));

    if (hasSource && hasDeps) {
      return candidate;
    }
  }

  return undefined;
}

function isRepoLocalTokagentCorePackageRoot(
  packageName: string,
  packageRoot: string,
  repoRoot: string,
): boolean {
  if (packageName !== "@tokagentos/core") {
    return false;
  }

  const localRoot = getRepoLocalTokagentCoreRoot(packageName, repoRoot);
  if (!localRoot) {
    return false;
  }

  return path.resolve(packageRoot) === path.resolve(localRoot);
}

const MODULE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];
const require = createRequire(import.meta.url);

type ModuleNamespace = Record<string, unknown> & {
  default?: Record<string, unknown>;
};

function getRequireFor(baseDir?: string) {
  if (!baseDir) {
    return require;
  }

  return createRequire(path.join(baseDir, "package.json"));
}

function firstExistingPath(
  candidates: Array<string | undefined>,
): string | undefined {
  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && existsSync(candidate),
  );
}

export function resolveModuleEntry(basePath: string): string {
  if (existsSync(basePath)) {
    return basePath;
  }

  const withExtension = firstExistingPath(
    MODULE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
  );

  return withExtension ?? basePath;
}

export function getInstalledPackageRoot(
  packageName: string,
  fromDir?: string,
): string | undefined {
  if (fromDir) {
    const localPackage = getRepoLocalWorkspaceRoot(packageName, fromDir);
    if (localPackage) return localPackage;
  }

  const scopedRequire = getRequireFor(fromDir);

  try {
    return path.dirname(scopedRequire.resolve(`${packageName}/package.json`));
  } catch {
    try {
      const entryPath = scopedRequire.resolve(packageName);
      return path.dirname(entryPath);
    } catch {
      return undefined;
    }
  }
}

export function getInstalledPackageEntry(
  packageName: string,
  repoRoot: string,
  subpath?: "node",
): string | undefined {
  const packageRoot = getInstalledPackageRoot(packageName, repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  const preferSource = isRepoLocalTokagentCorePackageRoot(
    packageName,
    packageRoot,
    repoRoot,
  );
  const candidates = preferSource
    ? subpath === "node"
      ? [
          path.join(packageRoot, "src", "index.node"),
          path.join(packageRoot, "src", "index"),
          path.join(packageRoot, "dist", "node", "index.node"),
          path.join(packageRoot, "dist", "index"),
          path.join(packageRoot, "index.node"),
          path.join(packageRoot, "index"),
        ]
      : [
          path.join(packageRoot, "src", "index.node"),
          path.join(packageRoot, "src", "index"),
          path.join(packageRoot, "dist", "node", "index.node"),
          path.join(packageRoot, "dist", "index"),
          path.join(packageRoot, "index.node"),
          path.join(packageRoot, "index"),
        ]
    : subpath === "node"
      ? [
          path.join(packageRoot, "dist", "node", "index.node"),
          path.join(packageRoot, "index.node"),
          path.join(packageRoot, "src", "index.node"),
          path.join(packageRoot, "src", "index"),
          path.join(packageRoot, "index"),
        ]
      : [
          path.join(packageRoot, "dist", "node", "index.node"),
          path.join(packageRoot, "dist", "index"),
          path.join(packageRoot, "src", "index"),
          path.join(packageRoot, "index.node"),
          path.join(packageRoot, "index"),
        ];

  const resolvedCandidate = candidates
    .map((candidate) => resolveModuleEntry(candidate))
    .find((candidate) => existsSync(candidate));

  return resolvedCandidate ?? resolveModuleEntry(candidates[0]);
}

function getNamedExport<T>(
  moduleNamespace: ModuleNamespace,
  exportName: string,
): T | undefined {
  if (exportName in moduleNamespace) {
    return moduleNamespace[exportName] as T;
  }

  const defaultNamespace = moduleNamespace.default;
  if (
    defaultNamespace &&
    typeof defaultNamespace === "object" &&
    exportName in defaultNamespace
  ) {
    return defaultNamespace[exportName] as T;
  }

  return undefined;
}

async function tryImportNamedExport<T>(
  specifier: string,
  exportName: string,
): Promise<{ value?: T; error?: string }> {
  try {
    const moduleNamespace = (await import(specifier)) as ModuleNamespace;
    const value = getNamedExport<T>(moduleNamespace, exportName);
    if (value !== undefined) {
      return { value };
    }

    return {
      error: `${specifier}: missing export ${exportName}`,
    };
  } catch (error) {
    return {
      error: `${specifier}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function getInstalledPackageNamedExport<T>(
  packageName: string,
  exportName: string,
  repoRoot: string,
  subpath?: "node",
): Promise<T> {
  const attempts: string[] = [];
  const specifiers = subpath
    ? [`${packageName}/${subpath}`, packageName]
    : [packageName];

  for (const specifier of specifiers) {
    const result = await tryImportNamedExport<T>(specifier, exportName);
    if (result.value !== undefined) {
      return result.value;
    }
    if (result.error) {
      attempts.push(result.error);
    }
  }

  const entry = getInstalledPackageEntry(packageName, repoRoot, subpath);
  if (entry) {
    const result = await tryImportNamedExport<T>(
      pathToFileURL(entry).href,
      exportName,
    );
    if (result.value !== undefined) {
      return result.value;
    }
    if (result.error) {
      attempts.push(result.error);
    }
  }

  throw new TypeError(
    `${exportName} export not found in ${packageName}. Tried: ${attempts.join(" | ")}`,
  );
}

export function getTokagentCoreEntry(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@tokagentos/core", repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  const candidates = isRepoLocalTokagentCorePackageRoot(
    "@tokagentos/core",
    packageRoot,
    repoRoot,
  )
    ? [
        path.join(packageRoot, "src", "index.node"),
        path.join(packageRoot, "src", "index"),
        path.join(packageRoot, "dist", "node", "index.node"),
        path.join(packageRoot, "dist", "index"),
        path.join(packageRoot, "index.node"),
        path.join(packageRoot, "index"),
      ]
    : [
        path.join(packageRoot, "dist", "node", "index.node"),
        path.join(packageRoot, "dist", "index"),
        path.join(packageRoot, "src", "index.node"),
        path.join(packageRoot, "src", "index"),
        path.join(packageRoot, "index.node"),
        path.join(packageRoot, "index"),
      ];

  const resolvedCandidate = candidates
    .map((candidate) => resolveModuleEntry(candidate))
    .find((candidate) => existsSync(candidate));

  return resolvedCandidate ?? resolveModuleEntry(candidates[0]);
}

export function getAutonomousSourceRoot(repoRoot: string): string | undefined {
  const packageRoot =
    getInstalledPackageRoot("@tokagentos/agent", repoRoot) ??
    getInstalledPackageRoot("@tokagentos/agent", repoRoot);

  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return packageRoot;
  }

  const directSrc = path.join(packageRoot, "src");
  if (existsSync(directSrc)) {
    return directSrc;
  }

  return path.join(packageRoot, "packages", "agent", "src");
}

export function getAppCoreSourceRoot(repoRoot: string): string | undefined {
  const packageRoot =
    getInstalledPackageRoot("@tokagentos/app-core", repoRoot) ??
    getInstalledPackageRoot("@tokagentos/app-core", repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return packageRoot;
  }

  const sourceRoot = path.join(packageRoot, "src");
  return existsSync(sourceRoot) ? sourceRoot : packageRoot;
}

export function getSharedSourceRoot(repoRoot: string): string | undefined {
  const packageRoot =
    getInstalledPackageRoot("@tokagentos/shared", repoRoot) ??
    getInstalledPackageRoot("@tokagentos/shared", repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return packageRoot;
  }

  const sourceRoot = path.join(packageRoot, "src");
  return existsSync(sourceRoot) ? sourceRoot : packageRoot;
}

export function getUiSourceRoot(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@tokagentos/ui", repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return packageRoot;
  }

  const sourceRoot = path.join(packageRoot, "src");
  return existsSync(path.join(sourceRoot, "index.ts"))
    ? sourceRoot
    : packageRoot;
}
