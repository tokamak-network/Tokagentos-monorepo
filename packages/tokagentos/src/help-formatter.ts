import type { Command } from "commander";
import { c } from "./theme.js";

// Apply TAL palette to commander help output. Overrides commander's default
// help formatter so the output uses the brand colors: section headers in
// fuchsia bold, command names in purple bold, flag short forms in cyan,
// long forms in lavender, descriptions in default terminal color.
export function applyHelpTheme<T extends Command>(cmd: T): T {
	cmd.configureHelp({
		commandUsage: (command) => `${c.brandBold(command.name())} ${command.usage()}`,
		subcommandTerm: (sub) => {
			const name = c.brand(sub.name());
			const args = sub.registeredArguments
				.map((a) => {
					const term = a.required ? `<${a.name()}>` : `[${a.name()}]`;
					return c.muted(term);
				})
				.join(" ");
			return args ? `${name} ${args}` : name;
		},
		optionTerm: (opt) => {
			// flags is like "-h, --help" or "--flag <val>" — color each piece.
			return opt.flags
				.split(/(\s*,\s*)/)
				.map((part) => {
					const t = part.trim();
					if (/^-[^-]/.test(t)) return c.secondary(part);
					if (/^--/.test(t)) return c.highlight(part);
					return part;
				})
				.join("");
		},
	});
	const origHelp = cmd.helpInformation.bind(cmd);
	cmd.helpInformation = () => {
		return origHelp()
			.replace(/^(Commands):/gm, c.warningBold("$1:"))
			.replace(/^(Options):/gm, c.warningBold("$1:"))
			.replace(/^(Usage):/gm, c.warningBold("$1:"));
	};
	return cmd;
}
