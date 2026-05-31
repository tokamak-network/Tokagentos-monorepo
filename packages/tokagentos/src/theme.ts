import chalk from "chalk";

// tokagentOS palette — mirrors the design tokens of the official marketing
// site (www.tokagentos.com): gold accent (#f0b90b) on dark, with a tight
// deep-gold → gold → highlight-gold gradient used by the CLI banner. Matches
// brand-gold.css (the app's UI token map).
export const palette = {
	brand: "#f0b90b",
	gradientStart: "#d8a000",
	gradientMid: "#f0b90b",
	gradientEnd: "#f3ba2f",
	secondary: "#f3ba2f",
	highlight: "#f3ba2f",
	warning: "#ffd641",
	error: "#ff494a",
	muted: "#9ca3af",
} as const;

// Convenience colorizers. Fall back silently when the terminal does not
// support truecolor — chalk handles the downgrade.
export const c = {
	brand: chalk.hex(palette.brand),
	brandBold: chalk.hex(palette.brand).bold,
	secondary: chalk.hex(palette.secondary),
	highlight: chalk.hex(palette.highlight),
	warning: chalk.hex(palette.warning),
	warningBold: chalk.hex(palette.warning).bold,
	error: chalk.hex(palette.error),
	muted: chalk.hex(palette.muted),
} as const;
