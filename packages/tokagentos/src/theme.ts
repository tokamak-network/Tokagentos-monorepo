import chalk from "chalk";

// Tokagent palette — mirrors the design tokens used by the marketing site
// (www.tokagent.network). Lime accent (#c4f547) on dark, with a tight
// dark-lime → lime → light-lime gradient used by the CLI banner. See
// apps/app/src/brand-purple.css in the scaffold-patches for the full UI
// token map this is derived from.
export const palette = {
	brand: "#c4f547",
	gradientStart: "#8ab81d",
	gradientMid: "#c4f547",
	gradientEnd: "#d5f972",
	secondary: "#d5f972",
	highlight: "#d5f972",
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
