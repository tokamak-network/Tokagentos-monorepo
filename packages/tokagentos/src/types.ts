export type TemplateId = "fullstack-app";

export interface TemplateUpstream {
  path: string;
  repo: string;
  branch?: string;
  /**
   * Optional commit SHA to pin the upstream submodule to. When set, the
   * scaffold checks out exactly this commit after `git submodule add`,
   * so subsequent upstream changes (file renames, removed exports, ABI
   * drifts) cannot break new scaffolds. Bump this field deliberately
   * after vetting a newer commit; users override via the
   * TOKAGENTOS_UPSTREAM_COMMIT env var.
   */
  commit?: string;
  mode: "git-submodule";
  requiredSubmodules?: string[];
  requiredWorkspaces?: string[];
}

export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
  kind: TemplateId;
  version: number;
  languages: string[];
  upstream?: TemplateUpstream;
}

export interface TemplatesManifest {
  version: string;
  generatedAt: string;
  repoUrl: string;
  templates: TemplateDefinition[];
}

export interface FullstackTemplateValues extends Record<string, string> {
  appName: string;
  appUrl: string;
  bugReportUrl: string;
  bundleId: string;
  docsUrl: string;
  fileExtension: string;
  hashtag: string;
  orgName: string;
  packageScope: string;
  projectSlug: string;
  releaseBaseUrl: string;
  repoName: string;
}
