import * as fs from "node:fs";
import * as path from "node:path";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { getTemplateById, getTemplates, getTemplatesDir } from "../manifest.js";
import { getCliVersion } from "../package-info.js";
import { writeProjectMetadata } from "../project-metadata.js";
import {
  buildFullstackTemplateValues,
  buildMetadata,
  buildPluginTemplateValues,
  getTemplateReplacementEntries,
  hydrateGitSubmoduleWorkspace,
  initializeGitSubmodule,
  renderTemplateTree,
  resolveTemplateSourceDir,
  resolveTemplateUpstream,
} from "../scaffold.js";
import type {
  CreateOptions,
  FullstackTemplateValues,
  PluginTemplateValues,
} from "../types.js";

const LANGUAGE_NAMES: Record<string, string> = {
  python: "Python",
  rust: "Rust",
  typescript: "TypeScript",
};

const TEMPLATE_ICONS: Record<string, string> = {
  "fullstack-app": "🧱",
  plugin: "🔌",
};

/**
 * LLM providers the scaffolded project can be pre-configured for.
 * Selecting one writes <PROVIDER>_API_KEY=<key> to the project's .env.
 * The `skip` option writes no key and leaves the user to configure later.
 */
interface LlmProvider {
  id: string;
  label: string;
  envVar: string;
  hint?: string;
}

const LLM_PROVIDERS: readonly LlmProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    hint: "sk-proj-…",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    envVar: "ANTHROPIC_API_KEY",
    hint: "sk-ant-api03-…",
  },
  {
    id: "google",
    label: "Google (Gemini)",
    envVar: "GOOGLE_API_KEY",
    hint: "AIza…",
  },
  {
    id: "groq",
    label: "Groq",
    envVar: "GROQ_API_KEY",
    hint: "gsk_…",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    hint: "sk-or-v1-…",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    envVar: "XAI_API_KEY",
    hint: "xai-…",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    hint: "sk-…",
  },
  {
    id: "ollama",
    label: "Ollama (local, no API key)",
    envVar: "",
  },
  {
    id: "skip",
    label: "Skip — I'll configure later",
    envVar: "",
  },
] as const;

function findLlmProvider(id: string): LlmProvider | undefined {
  return LLM_PROVIDERS.find((p) => p.id === id.toLowerCase());
}

function normalizeProjectName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unwrapPromptResult<T>(value: T, message = "Operation cancelled."): T {
  if (clack.isCancel(value)) {
    clack.cancel(message);
    process.exit(0);
  }
  return value;
}

function validateProjectDirectory(
  name: string | undefined,
): string | Error | undefined {
  const normalized = normalizeProjectName(name ?? "");
  if (!normalized) return "Project name is required";
  if (fs.existsSync(normalized))
    return `Directory '${normalized}' already exists`;
  return undefined;
}

function getNextSteps(options: {
  projectDir: string;
  skipUpstream?: boolean;
  templateId: string;
}): string[] {
  const steps = [`cd ${options.projectDir}`];
  if (options.templateId === "fullstack-app" && options.skipUpstream) {
    steps.push("npx tokagentos upgrade");
  }
  steps.push("bun install");
  steps.push(options.templateId === "plugin" ? "bun run build" : "bun run dev");
  return steps;
}

async function promptTemplateId(initial?: string): Promise<string> {
  if (initial) return initial;
  const templates = getTemplates();
  const choice = await clack.select({
    message: "Select a template:",
    options: templates.map((template) => ({
      value: template.id,
      label: `${TEMPLATE_ICONS[template.id] || "📦"} ${template.name}`,
      hint: template.description,
    })),
  });

  if (clack.isCancel(choice)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return choice as string;
}

async function promptLanguage(
  templateId: string,
  initial: string | undefined,
): Promise<string | undefined> {
  const template = getTemplateById(templateId);
  if (!template) return undefined;
  if (template.languages.length <= 1) {
    return template.languages[0];
  }
  if (initial) return initial;

  const choice = await clack.select({
    message: "Select a language:",
    options: template.languages.map((language) => ({
      value: language,
      label: LANGUAGE_NAMES[language] || language,
    })),
  });

  if (clack.isCancel(choice)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return choice as string;
}

async function promptProjectName(
  templateId: string,
  initial?: string,
): Promise<string> {
  if (initial) return normalizeProjectName(initial);
  const defaultValue = templateId === "plugin" ? "plugin-example" : "my-app";
  const input = await clack.text({
    defaultValue,
    message: "Project name:",
    placeholder: defaultValue,
    validate: validateProjectDirectory,
  });

  if (clack.isCancel(input)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return normalizeProjectName(input as string);
}

async function promptLlmProvider(
  initial: string | undefined,
  yes: boolean,
): Promise<LlmProvider> {
  if (initial) {
    const match = findLlmProvider(initial);
    if (!match) {
      clack.cancel(
        `Unknown --llm value '${initial}'. Valid: ${LLM_PROVIDERS.map((p) => p.id).join(", ")}.`,
      );
      process.exit(1);
    }
    return match;
  }
  if (yes) {
    return findLlmProvider("skip") as LlmProvider;
  }
  const choice = await clack.select({
    message: "Which LLM provider do you want to pre-configure?",
    options: LLM_PROVIDERS.map((p) => ({
      value: p.id,
      label: p.label,
      hint: p.envVar || undefined,
    })),
  });
  return findLlmProvider(
    unwrapPromptResult(choice as string),
  ) as LlmProvider;
}

async function promptApiKey(
  provider: LlmProvider,
  initial: string | undefined,
  yes: boolean,
): Promise<string | undefined> {
  if (!provider.envVar) {
    return undefined;
  }
  if (initial) {
    return initial;
  }
  if (yes) {
    return undefined;
  }
  const input = await clack.password({
    message: `Enter your ${provider.label} API key (leave empty to skip):`,
    mask: "·",
  });
  if (clack.isCancel(input)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }
  const trimmed = (input as string).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Append or create <projectRoot>/.env with the selected provider's key.
 * If a .env already exists and already has the var set, leaves it alone
 * (the scaffolded project's own .env.example flow remains source of truth
 * for placeholder variables; we only set the user-supplied API key).
 */
function writeLlmEnvFile(
  projectRoot: string,
  provider: LlmProvider,
  apiKey: string,
): void {
  if (!provider.envVar || !apiKey) return;
  const envPath = path.join(projectRoot, ".env");
  const line = `${provider.envVar}=${apiKey}`;
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, "utf8");
    const re = new RegExp(`^${provider.envVar}=.*$`, "m");
    if (re.test(existing)) {
      fs.writeFileSync(envPath, existing.replace(re, line));
    } else {
      const sep = existing.endsWith("\n") ? "" : "\n";
      fs.writeFileSync(envPath, `${existing}${sep}${line}\n`);
    }
  } else {
    fs.writeFileSync(
      envPath,
      `# API key set by \`tokagentos create --llm ${provider.id}\`.\n${line}\n`,
    );
  }
}

async function promptPluginValues(
  projectName: string,
  options: CreateOptions,
): Promise<PluginTemplateValues> {
  const normalized = normalizeProjectName(projectName);
  const defaultRepoName = normalized.startsWith("plugin-")
    ? normalized
    : `plugin-${normalized}`;
  const githubUsername = options.githubUsername?.trim()
    ? options.githubUsername.trim()
    : options.yes
      ? "your-github-username"
      : (unwrapPromptResult(
          await clack.text({
            defaultValue: "your-github-username",
            message: "GitHub username:",
          }),
        ) as string);
  const pluginDescription = options.description?.trim()
    ? options.description.trim()
    : options.yes
      ? `${defaultRepoName} plugin for tokagentOS`
      : (unwrapPromptResult(
          await clack.text({
            defaultValue: `${defaultRepoName} plugin for tokagentOS`,
            message: "Plugin description:",
          }),
        ) as string);
  const repoUrl =
    options.repoUrl?.trim() ||
    `https://github.com/${githubUsername}/${defaultRepoName}`;

  return buildPluginTemplateValues({
    tokagentVersion: getCliVersion(),
    githubUsername,
    pluginDescription,
    projectName: defaultRepoName,
    repoUrl,
  });
}

export async function create(
  projectName: string | undefined,
  options: CreateOptions,
): Promise<void> {
  clack.intro(pc.bgCyan(pc.black(" tokagentOS ")));

  const templateId = await promptTemplateId(options.template);
  const template = getTemplateById(templateId);
  if (!template) {
    clack.cancel(`Template '${templateId}' not found.`);
    process.exit(1);
  }

  const language = await promptLanguage(template.id, options.language);
  if (language && !template.languages.includes(language)) {
    clack.cancel(
      `Template '${template.name}' does not support language '${language}'.`,
    );
    process.exit(1);
  }

  let finalProjectName = await promptProjectName(template.id, projectName);
  if (template.id === "plugin" && !finalProjectName.startsWith("plugin-")) {
    finalProjectName = `plugin-${finalProjectName}`;
  }

  if (fs.existsSync(finalProjectName)) {
    clack.cancel(`Directory '${finalProjectName}' already exists.`);
    process.exit(1);
  }

  const values: PluginTemplateValues | FullstackTemplateValues =
    template.id === "plugin"
      ? await promptPluginValues(finalProjectName, options)
      : buildFullstackTemplateValues(finalProjectName);

  // LLM provider + API key — only meaningful for templates that run an
  // agent; plugin scaffolds don't need them.
  const llmProvider =
    template.id === "fullstack-app"
      ? await promptLlmProvider(options.llm, Boolean(options.yes))
      : (findLlmProvider("skip") as LlmProvider);
  const apiKey =
    llmProvider.envVar.length > 0
      ? await promptApiKey(llmProvider, options.apiKey, Boolean(options.yes))
      : undefined;

  if (!options.yes) {
    const confirmed = await clack.confirm({
      message: `Create ${pc.cyan(template.name)} in ${pc.cyan(finalProjectName)}?`,
    });
    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  const destinationDir = path.resolve(process.cwd(), finalProjectName);
  const sourceDir = resolveTemplateSourceDir({
    language,
    template,
    templatesDir: getTemplatesDir(),
  });
  const replacements = getTemplateReplacementEntries({
    templateId: template.id,
    values: values as Record<string, string>,
  });

  const spinner = clack.spinner();
  spinner.start("Creating project...");

  const managedFiles = renderTemplateTree({
    destinationDir,
    replacements,
    sourceDir,
  });

  if (template.upstream && !options.skipUpstream) {
    const upstream = resolveTemplateUpstream(template.upstream);
    spinner.message("Initializing upstream tokagent checkout...");
    initializeGitSubmodule({
      branch: upstream.branch,
      projectRoot: destinationDir,
      repo: upstream.repo,
      submodulePath: upstream.path,
    });
    hydrateGitSubmoduleWorkspace({
      projectRoot: destinationDir,
      upstream,
    });
  }

  writeProjectMetadata(
    destinationDir,
    buildMetadata({
      cliVersion: getCliVersion(),
      language,
      managedFiles,
      template,
      values: values as Record<string, string>,
    }),
  );

  if (apiKey) {
    writeLlmEnvFile(destinationDir, llmProvider, apiKey);
    spinner.message(
      `Wrote ${llmProvider.envVar} to .env (${llmProvider.label})`,
    );
  }

  spinner.stop("Project created successfully!");

  console.log();
  clack.note(
    getNextSteps({
      projectDir: finalProjectName,
      skipUpstream: options.skipUpstream,
      templateId: template.id,
    }).join("\n"),
    "Next steps",
  );
  clack.outro(`${pc.green("✨")} Your ${template.name} project is ready!`);
}
