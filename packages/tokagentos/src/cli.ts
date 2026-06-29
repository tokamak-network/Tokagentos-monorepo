#!/usr/bin/env node

import { Command } from "commander";
import { renderBanner } from "./banner.js";
import { create } from "./commands/index.js";
import { applyHelpTheme } from "./help-formatter.js";
import { getCliVersion } from "./package-info.js";

const program = new Command();

applyHelpTheme(program);

program
  .name("tokagentos")
  .description("Create a tokagentOS project")
  .version(getCliVersion(), "-v, --version")
  .action(create);

// Show banner on bare invocation or --help (suppressed for non-TTY / NO_COLOR).
const argv = process.argv.slice(2);
const wantsBanner =
  argv.length === 0 || argv.includes("--help") || argv.includes("-h");
if (wantsBanner) {
  process.stdout.write(renderBanner());
}

await program.parseAsync();
