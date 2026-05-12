import * as fs from "node:fs";
import * as os from "node:os";
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
    id: "x402",
    label: "x402 only (can be configured from the gateway)",
    // Sources dispatch from OpenRouter under the hood so the chat tab
    // works immediately; the canonical billing path runs through the
    // x402 sidebar tab once the project boots.
    envVar: "OPENROUTER_API_KEY",
    hint: "sk-or-v1-…  (used for LLM dispatch; billing config lives in the x402 tab)",
  },
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
    id: "litellm",
    label: "LiteLLM Proxy (OpenAI-compatible)",
    envVar: "LITELLM_API_KEY",
    hint: "lt-...",
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
  required: boolean,
): Promise<LlmProvider> {
  if (initial) {
    const match = findLlmProvider(initial);
    if (!match) {
      clack.cancel(
        `Unknown --llm value '${initial}'. Valid: ${LLM_PROVIDERS.map((p) => p.id).join(", ")}.`,
      );
      process.exit(1);
    }
    if (required && !match.envVar) {
      clack.cancel(
        `--llm '${initial}' is not a real provider for fullstack-app. Pick one that requires an API key (openai, anthropic, google, groq, openrouter).`,
      );
      process.exit(1);
    }
    return match;
  }
  if (yes) {
    if (required) {
      clack.cancel(
        "fullstack-app requires --llm <provider> and --api-key <key> when using --yes. Provider options: openai, anthropic, google, groq, openrouter.",
      );
      process.exit(1);
    }
    return findLlmProvider("skip") as LlmProvider;
  }
  // Hide providers without an API key (ollama, skip) when one is required.
  const options = LLM_PROVIDERS.filter((p) => !required || p.envVar.length > 0);
  const choice = await clack.select({
    message: required
      ? "Which LLM provider will this project use? (required)"
      : "Which LLM provider do you want to pre-configure?",
    options: options.map((p) => ({
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
  required: boolean,
): Promise<string | undefined> {
  if (!provider.envVar) {
    return undefined;
  }
  if (initial) {
    return initial;
  }
  if (yes) {
    if (required) {
      clack.cancel(
        `--llm ${provider.id} needs --api-key <key> when using --yes. Get one from the provider's dashboard and pass it via --api-key.`,
      );
      process.exit(1);
    }
    return undefined;
  }
  while (true) {
    const input = await clack.password({
      message: required
        ? `Enter your ${provider.label} API key (required):`
        : `Enter your ${provider.label} API key (leave empty to skip):`,
      mask: "·",
    });
    if (clack.isCancel(input)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }
    const trimmed = (input as string).trim();
    if (trimmed.length > 0) return trimmed;
    if (!required) return undefined;
    clack.log.warn(`API key is required for ${provider.label}. Try again.`);
  }
}

async function promptLitellmExtras(
  options: CreateOptions,
  yes: boolean,
): Promise<{ baseUrl: string; smallModel: string; largeModel: string }> {
  if (yes) {
    const missing: string[] = [];
    if (!options.llmBaseUrl?.trim()) missing.push("--llm-base-url");
    if (!options.llmSmallModel?.trim()) missing.push("--llm-small-model");
    if (!options.llmLargeModel?.trim()) missing.push("--llm-large-model");
    if (missing.length > 0) {
      clack.cancel(
        `--llm litellm with --yes requires ${missing.join(", ")}. Get these values from your LiteLLM proxy admin.`,
      );
      process.exit(1);
    }
    return {
      baseUrl: options.llmBaseUrl!.trim(),
      smallModel: options.llmSmallModel!.trim(),
      largeModel: options.llmLargeModel!.trim(),
    };
  }
  const baseUrl = options.llmBaseUrl?.trim()
    ? options.llmBaseUrl.trim()
    : (unwrapPromptResult(
        await clack.text({
          message: "LiteLLM proxy base URL (e.g. https://litellm.company.com):",
          placeholder: "https://litellm.company.com",
          validate: (v) =>
            !v?.trim() ? "Base URL is required for LiteLLM" : undefined,
        }),
      ) as string).trim();
  const smallModel = options.llmSmallModel?.trim()
    ? options.llmSmallModel.trim()
    : (unwrapPromptResult(
        await clack.text({
          defaultValue: "gpt-4o-mini",
          message:
            "Small model alias (used for TEXT_SMALL). Default: gpt-4o-mini",
          placeholder: "gpt-4o-mini",
        }),
      ) as string).trim();
  const largeModel = options.llmLargeModel?.trim()
    ? options.llmLargeModel.trim()
    : (unwrapPromptResult(
        await clack.text({
          defaultValue: "gpt-4o",
          message: "Large model alias (used for TEXT_LARGE). Default: gpt-4o",
          placeholder: "gpt-4o",
        }),
      ) as string).trim();
  return { baseUrl, smallModel, largeModel };
}

/**
 * Pre-complete the app's onboarding state so the UI skips the provider/
 * API-key prompt (the user already supplied both at `tokagentos create`
 * time). The app looks up state from `~/.eliza/<namespace>.json` — this
 * path is the upstream runtime convention (packages/agent/src/config/paths.ts
 * resolveConfigPath). The namespace is the project name passed via
 * `bun run dev --name=<project>`. The check reads
 * `config.meta.onboardingComplete === true` (packages/app-core/src/state/
 * onboarding-bootstrap.ts).
 *
 * If a config file already exists at the path, we leave it alone
 * (respects prior user state). If it doesn't, we write a minimal
 * {"meta":{"onboardingComplete":true}} plus a service routing hint
 * for the selected provider. The runtime fills in the rest.
 */
function preCompleteOnboarding(
  projectName: string,
  provider: LlmProvider,
): void {
  if (!provider.envVar) return; // ollama / skip — no key set, don't claim done
  const stateDir = path.join(os.homedir(), ".eliza");
  const configPath = path.join(stateDir, `${projectName}.json`);
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    if (fs.existsSync(configPath)) return; // don't clobber existing state
    const config = {
      meta: { onboardingComplete: true },
      serviceRouting: {
        llmText: {
          backend: provider.id,
          transport: "local",
        },
      },
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  } catch {
    // Non-fatal — user can click through the onboarding flow once if
    // filesystem prevents the write.
  }
}

/**
 * Create or update <projectRoot>/.env for a fresh scaffold.
 *
 * Strategy:
 *   1. If .env does not exist and .env.example does, start from the example.
 *      The example carries all the Tokagent config variables with safe
 *      defaults (TOKAGENT_EXECUTION_MODE=vault) and commented placeholders
 *      for the private key / vault addresses / RPC overrides. The user only
 *      has to uncomment + fill.
 *   2. Uncomment the selected LLM provider's env var line and set the user's
 *      API key. Leave other provider lines commented.
 *   3. If a user-supplied .env already existed (e.g., re-running the CLI),
 *      only update/insert the API key line — don't overwrite anything else.
 */
function writeLlmEnvFile(
  projectRoot: string,
  provider: LlmProvider,
  apiKey: string,
): void {
  if (!provider.envVar || !apiKey) return;
  const envPath = path.join(projectRoot, ".env");
  const examplePath = path.join(projectRoot, ".env.example");
  const apiKeyLine = `${provider.envVar}=${apiKey}`;

  // Case 1: .env exists — preserve user edits; only patch the API key line.
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, "utf8");
    const activeRe = new RegExp(`^${provider.envVar}=.*$`, "m");
    if (activeRe.test(existing)) {
      fs.writeFileSync(envPath, existing.replace(activeRe, apiKeyLine));
      return;
    }
    // Try to uncomment a commented placeholder line.
    const commentedRe = new RegExp(`^#\\s*${provider.envVar}=.*$`, "m");
    if (commentedRe.test(existing)) {
      fs.writeFileSync(envPath, existing.replace(commentedRe, apiKeyLine));
      return;
    }
    // Neither active nor commented — append.
    const sep = existing.endsWith("\n") ? "" : "\n";
    fs.writeFileSync(envPath, `${existing}${sep}${apiKeyLine}\n`);
    return;
  }

  // Case 2: fresh .env — start from .env.example if present, else minimal file.
  let base: string;
  if (fs.existsSync(examplePath)) {
    base = fs.readFileSync(examplePath, "utf8");
  } else {
    base = `# API key set by \`tokagentos create --llm ${provider.id}\`.\n`;
  }
  // Replace an active or commented placeholder line; append if neither exists.
  const activeRe2 = new RegExp(`^${provider.envVar}=.*$`, "m");
  const commentedRe = new RegExp(`^#\\s*${provider.envVar}=.*$`, "m");
  let filled: string;
  if (activeRe2.test(base)) {
    filled = base.replace(activeRe2, apiKeyLine);
  } else if (commentedRe.test(base)) {
    filled = base.replace(commentedRe, apiKeyLine);
  } else {
    filled = `${base.endsWith("\n") ? base : `${base}\n`}${apiKeyLine}\n`;
  }
  fs.writeFileSync(envPath, filled);
}

/**
 * Write a set of additional `.env` lines to a fresh-or-existing project .env.
 * Mirrors the behavior of writeLlmEnvFile but supports multi-key providers
 * (e.g., LiteLLM needs base URL + small model + large model in addition to
 * the API key).
 *
 * Each entry is written using the same active/commented-line resolution
 * logic as writeLlmEnvFile to play nicely with the .env.example template.
 */
function writeLlmExtraEnv(
  projectRoot: string,
  entries: Array<{ key: string; value: string }>,
): void {
  if (entries.length === 0) return;
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) {
    // writeLlmEnvFile created it; should not happen, but be defensive.
    fs.writeFileSync(envPath, "");
  }
  let content = fs.readFileSync(envPath, "utf8");
  for (const { key, value } of entries) {
    const line = `${key}=${value}`;
    const activeRe = new RegExp(`^${key}=.*$`, "m");
    const commentedRe = new RegExp(`^#\\s*${key}=.*$`, "m");
    if (activeRe.test(content)) {
      content = content.replace(activeRe, line);
    } else if (commentedRe.test(content)) {
      content = content.replace(commentedRe, line);
    } else {
      content = `${content.endsWith("\n") ? content : `${content}\n`}${line}\n`;
    }
  }
  fs.writeFileSync(envPath, content);
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
  // agent; plugin scaffolds don't need them. For fullstack-app we require
  // a provider + key so the scaffolded project has everything it needs
  // to boot the agent and skip the UI onboarding flow.
  const isFullstack = template.id === "fullstack-app";
  const llmProvider = isFullstack
    ? await promptLlmProvider(
        options.llm,
        Boolean(options.yes),
        /* required */ true,
      )
    : (findLlmProvider("skip") as LlmProvider);
  const apiKey =
    llmProvider.envVar.length > 0
      ? await promptApiKey(
          llmProvider,
          options.apiKey,
          Boolean(options.yes),
          /* required */ isFullstack,
        )
      : undefined;

  let litellmExtras:
    | { baseUrl: string; smallModel: string; largeModel: string }
    | undefined;
  if (llmProvider.id === "litellm") {
    litellmExtras = await promptLitellmExtras(options, Boolean(options.yes));
  }

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
      commit: upstream.commit,
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
    if (litellmExtras) {
      writeLlmExtraEnv(destinationDir, [
        { key: "LITELLM_BASE_URL", value: litellmExtras.baseUrl },
        { key: "LITELLM_SMALL_MODEL", value: litellmExtras.smallModel },
        { key: "LITELLM_LARGE_MODEL", value: litellmExtras.largeModel },
      ]);
    }
    // OpenRouter model defaults — written unconditionally so the in-app
    // provider switcher can flip to OpenRouter later without the user
    // having to manually edit .env. Replaces the (deleted) surgical patch
    // on plugins/plugin-openrouter/typescript/utils/config.ts that
    // previously hardcoded these as the plugin's source-level defaults.
    // Override these by editing .env or via env var.
    writeLlmExtraEnv(destinationDir, [
      { key: "OPENROUTER_SMALL_MODEL", value: "anthropic/claude-haiku-4-5" },
      { key: "OPENROUTER_LARGE_MODEL", value: "anthropic/claude-sonnet-4.6" },
    ]);
    // Pre-complete onboarding so the UI doesn't prompt for the key again.
    preCompleteOnboarding(finalProjectName, llmProvider);
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
