import process from "node:process";

export const TOKAGENT_GITHUB_REPOSITORY = "tokagentos/tokagent";
const CDN_ORIGIN = "https://cdn.jsdelivr.net/gh";
const RAW_GITHUB_ORIGIN = "https://raw.githubusercontent.com";
const HOMEPAGE_ASSET_ROOT = "apps/homepage/public";

function normalizeReleaseTag(value) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.startsWith("v") ? normalized : `v${normalized}`;
}

export function resolveTokagentReleaseTag({ env = process.env } = {}) {
  return normalizeReleaseTag(
    env.TOKAGENT_RELEASE_TAG || env.RELEASE_TAG || env.GITHUB_REF_NAME,
  );
}

export function resolveTokagentAssetRepository({ env = process.env } = {}) {
  const configured =
    env.TOKAGENT_ASSET_GITHUB_REPOSITORY?.trim() || env.GITHUB_REPOSITORY?.trim();
  return configured || TOKAGENT_GITHUB_REPOSITORY;
}

export function isCanonicalTokagentRepository(repository) {
  return repository === TOKAGENT_GITHUB_REPOSITORY;
}

export function buildJsDelivrAssetBase({
  repository = TOKAGENT_GITHUB_REPOSITORY,
  releaseTag,
  assetRoot,
}) {
  if (!releaseTag || !assetRoot) {
    return "";
  }
  const normalizedRoot = assetRoot.replace(/^\/+|\/+$/g, "");
  return `${CDN_ORIGIN}/${repository}@${releaseTag}/${normalizedRoot}/`;
}

export function buildRawGitHubAssetBase({
  repository = TOKAGENT_GITHUB_REPOSITORY,
  releaseTag,
  assetRoot,
}) {
  if (!releaseTag || !assetRoot) {
    return "";
  }
  const normalizedRoot = assetRoot.replace(/^\/+|\/+$/g, "");
  return `${RAW_GITHUB_ORIGIN}/${repository}/${releaseTag}/${normalizedRoot}/`;
}

export function buildManagedAssetUrl({
  repository = TOKAGENT_GITHUB_REPOSITORY,
  releaseTag,
  assetRoot,
  assetPath,
}) {
  if (!releaseTag || !assetRoot || !assetPath) {
    return "";
  }

  const normalizedAssetPath = assetPath.replace(/^\/+/, "");
  const base = buildRawGitHubAssetBase({ repository, releaseTag, assetRoot });
  if (!base) return "";
  return new URL(normalizedAssetPath, base).toString();
}

export function buildReleaseValidationAssetUrl({
  repository = TOKAGENT_GITHUB_REPOSITORY,
  releaseTag,
  assetRoot,
  assetPath,
}) {
  if (!releaseTag || !assetRoot || !assetPath) {
    return "";
  }

  const normalizedAssetPath = assetPath.replace(/^\/+/, "");
  const base = buildRawGitHubAssetBase({ repository, releaseTag, assetRoot });
  if (!base) return "";
  return new URL(normalizedAssetPath, base).toString();
}

export function resolveTokagentAssetBaseUrls({
  env = process.env,
  releaseTag = resolveTokagentReleaseTag({ env }),
  repository = resolveTokagentAssetRepository({ env }),
} = {}) {
  const explicitAppBase =
    env.VITE_ASSET_BASE_URL?.trim() || env.TOKAGENT_ASSET_BASE_URL?.trim() || "";
  const explicitHomepageBase =
    env.VITE_HOMEPAGE_ASSET_BASE_URL?.trim() ||
    env.HOMEPAGE_ASSET_BASE_URL?.trim() ||
    "";

  return {
    releaseTag,
    appAssetBaseUrl:
      explicitAppBase ||
      buildJsDelivrAssetBase({
        repository,
        releaseTag,
        assetRoot: "apps/app/public",
      }),
    homepageAssetBaseUrl:
      explicitHomepageBase ||
      buildJsDelivrAssetBase({
        repository,
        releaseTag,
        assetRoot: HOMEPAGE_ASSET_ROOT,
      }),
  };
}

// Milady scripts still import the repo-local alias while the shared helper
// remains named for the upstream tokagentOS package.
export function resolveMiladyAssetBaseUrls(options = {}) {
  return resolveTokagentAssetBaseUrls(options);
}
