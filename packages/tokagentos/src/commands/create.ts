import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { getTemplateById, getTemplatesDir } from "../manifest.js";
import {
  buildFullstackTemplateValues,
  getFullstackReplacementEntries,
  hydrateGitSubmoduleWorkspace,
  initializeGitSubmodule,
  renderTemplateTree,
  resolveTemplateSourceDir,
  resolveTemplateUpstream,
} from "../scaffold.js";

const TEMPLATE_ID = "fullstack-app";

/**
 * LLM providers the scaffolded project can be pre-configured for.
 * Selecting one writes <PROVIDER>_API_KEY=<key> to the project's .env.
 */
interface LlmProvider {
  id: string;
  label: string;
  envVar: string;
  hint?: string;
  /**
   * When true, the provider is offered even though it doesn't write an API
   * key to `.env` during scaffold (x402 is configured in-app via the x402
   * tab after `bun run dev`).
   */
  configuredInApp?: boolean;
}

const LLM_PROVIDERS: readonly LlmProvider[] = [
  {
    id: "x402",
    label: "x402 only (can be configured from the gateway)",
    envVar: "",
    hint: "Configure from the x402 tab after `bun run dev`",
    configuredInApp: true,
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
  { id: "groq", label: "Groq", envVar: "GROQ_API_KEY", hint: "gsk_…" },
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

function getNextSteps(projectDir: string): string[] {
  return [`cd ${projectDir}`, "bun install", "bun run dev"];
}

// ─── Step 1: project name ────────────────────────────────────────────────────
async function promptProjectName(): Promise<string> {
  const input = await clack.text({
    defaultValue: "my-app",
    message: "Project name:",
    placeholder: "my-app",
    validate: validateProjectDirectory,
  });
  return normalizeProjectName(unwrapPromptResult(input) as string);
}

// ─── Step 2: LLM provider + key ──────────────────────────────────────────────
async function promptLlmProvider(): Promise<LlmProvider> {
  // Offer keyed providers + configuredInApp (x402). Local-only options are
  // not offered for the fullstack app.
  const options = LLM_PROVIDERS.filter(
    (p) => p.envVar.length > 0 || p.configuredInApp === true,
  );
  const choice = await clack.select({
    message: "Which LLM provider will this project use?",
    options: options.map((p) => ({
      value: p.id,
      label: p.label,
      hint: p.envVar || undefined,
    })),
  });
  return findLlmProvider(unwrapPromptResult(choice as string)) as LlmProvider;
}

async function promptApiKey(provider: LlmProvider): Promise<string> {
  while (true) {
    const input = await clack.password({
      message: `Enter your ${provider.label} API key:`,
      mask: "·",
    });
    const trimmed = (unwrapPromptResult(input) as string).trim();
    if (trimmed.length > 0) return trimmed;
    clack.log.warn(`API key is required for ${provider.label}. Try again.`);
  }
}

async function promptLitellmExtras(): Promise<{
  baseUrl: string;
  smallModel: string;
  largeModel: string;
}> {
  const baseUrl = (
    unwrapPromptResult(
      await clack.text({
        message: "LiteLLM proxy base URL (e.g. https://litellm.company.com):",
        placeholder: "https://litellm.company.com",
        validate: (v) =>
          !v?.trim() ? "Base URL is required for LiteLLM" : undefined,
      }),
    ) as string
  ).trim();
  const smallModel = (
    unwrapPromptResult(
      await clack.text({
        defaultValue: "gpt-4o-mini",
        message:
          "Small model alias (used for TEXT_SMALL). Default: gpt-4o-mini",
        placeholder: "gpt-4o-mini",
      }),
    ) as string
  ).trim();
  const largeModel = (
    unwrapPromptResult(
      await clack.text({
        defaultValue: "gpt-4o",
        message: "Large model alias (used for TEXT_LARGE). Default: gpt-4o",
        placeholder: "gpt-4o",
      }),
    ) as string
  ).trim();
  return { baseUrl, smallModel, largeModel };
}

/**
 * Pre-complete the app's onboarding state so the UI skips the provider/
 * API-key prompt. State lives at `~/.eliza/<namespace>.json` (the upstream
 * runtime convention). No-op if the file already exists or the provider sets
 * no key (x402).
 */
function preCompleteOnboarding(
  projectName: string,
  provider: LlmProvider,
): void {
  if (!provider.envVar) return;
  const stateDir = path.join(os.homedir(), ".eliza");
  const configPath = path.join(stateDir, `${projectName}.json`);
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    if (fs.existsSync(configPath)) return;
    const config = {
      meta: { onboardingComplete: true },
      serviceRouting: { llmText: { backend: provider.id, transport: "local" } },
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  } catch {
    // Non-fatal — user can click through onboarding once if the write fails.
  }
}

/** Materialize <projectRoot>/.env from .env.example if it doesn't exist. */
function ensureEnvFromExample(projectRoot: string): void {
  const envPath = path.join(projectRoot, ".env");
  const examplePath = path.join(projectRoot, ".env.example");
  if (fs.existsSync(envPath)) return;
  if (!fs.existsSync(examplePath)) return;
  fs.copyFileSync(examplePath, envPath);
}

/** Set or insert the selected provider's API-key line in <projectRoot>/.env. */
function writeLlmEnvFile(
  projectRoot: string,
  provider: LlmProvider,
  apiKey: string,
): void {
  if (!provider.envVar || !apiKey) return;
  const envPath = path.join(projectRoot, ".env");
  const examplePath = path.join(projectRoot, ".env.example");
  const apiKeyLine = `${provider.envVar}=${apiKey}`;
  const activeRe = new RegExp(`^${provider.envVar}=.*$`, "m");
  const commentedRe = new RegExp(`^#\\s*${provider.envVar}=.*$`, "m");

  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, "utf8");
    if (activeRe.test(existing)) {
      fs.writeFileSync(envPath, existing.replace(activeRe, apiKeyLine));
      return;
    }
    if (commentedRe.test(existing)) {
      fs.writeFileSync(envPath, existing.replace(commentedRe, apiKeyLine));
      return;
    }
    const sep = existing.endsWith("\n") ? "" : "\n";
    fs.writeFileSync(envPath, `${existing}${sep}${apiKeyLine}\n`);
    return;
  }

  const base = fs.existsSync(examplePath)
    ? fs.readFileSync(examplePath, "utf8")
    : `# API key set by \`tokagentos\` (${provider.id}).\n`;
  let filled: string;
  if (activeRe.test(base)) {
    filled = base.replace(activeRe, apiKeyLine);
  } else if (commentedRe.test(base)) {
    filled = base.replace(commentedRe, apiKeyLine);
  } else {
    filled = `${base.endsWith("\n") ? base : `${base}\n`}${apiKeyLine}\n`;
  }
  fs.writeFileSync(envPath, filled);
}

/** Write additional key=value lines to a project .env (multi-key providers). */
function writeLlmExtraEnv(
  projectRoot: string,
  entries: Array<{ key: string; value: string }>,
): void {
  if (entries.length === 0) return;
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) {
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

export interface ScaffoldProjectInput {
  cwd: string;
  projectName: string;
  providerId: string;
  apiKey?: string;
  litellm?: { baseUrl: string; smallModel: string; largeModel: string };
}

export interface ScaffoldProjectResult {
  projectDir: string;
  envVarWritten?: string;
}

/**
 * Headless project scaffolding — renders the fullstack-app template, initializes
 * the upstream tokagent checkout, materializes .env, and pre-completes the app's
 * onboarding. No prompts, no console UI. `create()` wraps this with the
 * interactive flow; the packaged smoke test calls it directly.
 */
export function scaffoldProject(
  input: ScaffoldProjectInput,
): ScaffoldProjectResult {
  const template = getTemplateById(TEMPLATE_ID);
  if (!template) {
    throw new Error(`Template '${TEMPLATE_ID}' not found.`);
  }
  const provider = findLlmProvider(input.providerId);
  if (!provider) {
    throw new Error(`Unknown LLM provider '${input.providerId}'.`);
  }
  const language = template.languages[0];
  const finalName = normalizeProjectName(input.projectName);
  const destinationDir = path.resolve(input.cwd, finalName);

  if (fs.existsSync(destinationDir)) {
    throw new Error(`Directory '${destinationDir}' already exists`);
  }

  const values = buildFullstackTemplateValues(finalName);
  const sourceDir = resolveTemplateSourceDir({
    language,
    template,
    templatesDir: getTemplatesDir(),
  });
  renderTemplateTree({
    destinationDir,
    replacements: getFullstackReplacementEntries(values),
    sourceDir,
  });

  if (template.upstream) {
    const upstream = resolveTemplateUpstream(template.upstream);
    initializeGitSubmodule({
      branch: upstream.branch,
      commit: upstream.commit,
      projectRoot: destinationDir,
      repo: upstream.repo,
      submodulePath: upstream.path,
    });
    hydrateGitSubmoduleWorkspace({ projectRoot: destinationDir, upstream });
  }

  ensureEnvFromExample(destinationDir);

  let envVarWritten: string | undefined;
  if (input.apiKey && provider.envVar) {
    writeLlmEnvFile(destinationDir, provider, input.apiKey);
    envVarWritten = provider.envVar;
    if (input.litellm) {
      writeLlmExtraEnv(destinationDir, [
        { key: "LITELLM_BASE_URL", value: input.litellm.baseUrl },
        { key: "LITELLM_SMALL_MODEL", value: input.litellm.smallModel },
        { key: "LITELLM_LARGE_MODEL", value: input.litellm.largeModel },
      ]);
    }
    // OpenRouter model defaults — written unconditionally so the in-app
    // provider switcher can flip to OpenRouter later without editing .env.
    writeLlmExtraEnv(destinationDir, [
      { key: "OPENROUTER_SMALL_MODEL", value: "anthropic/claude-haiku-4-5" },
      { key: "OPENROUTER_LARGE_MODEL", value: "anthropic/claude-sonnet-4.6" },
    ]);
    preCompleteOnboarding(finalName, provider);
  }

  return { projectDir: destinationDir, envVarWritten };
}

/**
 * Interactive two-step create flow: project name → LLM provider (+ key).
 */
export async function create(): Promise<void> {
  clack.intro(pc.bgCyan(pc.black(" tokagentOS ")));

  const projectName = await promptProjectName();

  const provider = await promptLlmProvider();
  const apiKey = provider.envVar ? await promptApiKey(provider) : undefined;
  const litellm =
    provider.id === "litellm" ? await promptLitellmExtras() : undefined;

  const spinner = clack.spinner();
  spinner.start("Creating project...");

  const result = scaffoldProject({
    cwd: process.cwd(),
    projectName,
    providerId: provider.id,
    apiKey,
    litellm,
  });

  if (result.envVarWritten) {
    spinner.message(
      `Wrote ${result.envVarWritten} to .env (${provider.label})`,
    );
  }
  spinner.stop("Project created successfully!");

  console.log();
  clack.note(
    getNextSteps(path.basename(result.projectDir)).join("\n"),
    "Next steps",
  );
  clack.outro(`${pc.green("✨")} Your project is ready!`);
}
