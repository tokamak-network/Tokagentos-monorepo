import pc from "picocolors";
import { readPackageJson } from "../package-info.js";
import { c } from "../theme.js";

export function version(): void {
  const packageJson = readPackageJson();
  console.log();
  console.log(c.brandBold("tokagentOS CLI"));
  console.log();
  console.log(`  ${pc.dim("Version:")}  ${pc.green(packageJson.version)}`);
  console.log(`  ${pc.dim("Package:")}  ${packageJson.name}`);
  console.log();
  console.log(pc.dim("  Create and upgrade tokagentOS project templates."));
  console.log();
}
