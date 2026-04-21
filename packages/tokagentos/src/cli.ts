#!/usr/bin/env node

import * as clack from "@clack/prompts";
import { Command } from "commander";
import { renderBanner } from "./banner.js";
import { create, info, upgrade, version } from "./commands/index.js";
import { applyHelpTheme } from "./help-formatter.js";
import { getCliVersion } from "./package-info.js";
import { c } from "./theme.js";

const program = new Command();

async function defaultAction(): Promise<void> {
	const choice = await clack.select({
		message: "What do you want to do?",
		options: [
			{ value: "create", label: "Create a new project" },
			{ value: "upgrade", label: "Upgrade the current project" },
			{ value: "info", label: "Show available templates" },
		],
	});

	if (clack.isCancel(choice)) {
		clack.cancel(c.warning("Operation cancelled."));
		process.exit(0);
	}

	if (choice === "create") {
		await create(undefined, {});
		return;
	}
	if (choice === "upgrade") {
		await upgrade({});
		return;
	}
	info({});
}

applyHelpTheme(program);

program
	.name("tokagentos")
	.description("Create and upgrade tokagentOS project templates")
	.version(getCliVersion(), "-v, --version");

applyHelpTheme(
	program.command("version").description("Display version information").action(version),
);

applyHelpTheme(
	program
		.command("info")
		.description("Display information about available templates")
		.option("-t, --template <template>", "Filter by template id")
		.option("-l, --language <lang>", "Filter by language")
		.option("-j, --json", "Output as JSON")
		.action(info),
);

applyHelpTheme(
	program
		.command("create")
		.description("Create a new tokagentOS project from a template")
		.argument("[name]", "Name for the new project directory")
		.option("-t, --template <template>", "Template to create")
		.option("-l, --language <lang>", "Template language")
		.option("-y, --yes", "Skip confirmation prompts")
		.option("--description <description>", "Plugin description override")
		.option("--github-username <username>", "Plugin GitHub username override")
		.option("--repo-url <url>", "Plugin repository URL override")
		.option("--skip-upstream", "Skip initializing the upstream tokagent checkout")
		.option(
			"--llm <provider>",
			"LLM provider to pre-configure: openai | anthropic | google | groq | openrouter | xai | deepseek | ollama | skip",
		)
		.option(
			"--api-key <key>",
			"API key for the selected LLM provider (written to .env). Requires --llm.",
		)
		.action(create),
);

applyHelpTheme(
	program
		.command("upgrade")
		.description("Upgrade the current generated project to the latest template")
		.option("--check", "Check what would change without writing files")
		.option("--dry-run", "Preview the upgrade without writing files")
		.option("--skip-upstream", "Skip updating the upstream tokagent checkout")
		.action(upgrade),
);

program.action(defaultAction);

// Show banner on bare invocation or --help (suppressed for non-TTY / NO_COLOR).
const argv = process.argv.slice(2);
const wantsBanner =
	argv.length === 0 || argv.includes("--help") || argv.includes("-h");
if (wantsBanner) {
	process.stdout.write(renderBanner());
}

await program.parseAsync();
