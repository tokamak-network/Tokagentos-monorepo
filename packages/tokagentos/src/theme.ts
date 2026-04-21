import chalk from "chalk";

// TAL palette (from Tokamak-AI-Layer/frontend/tailwind.config.ts).
export const palette = {
	brand: "#A855F7",
	gradientStart: "#7C3AED",
	gradientMid: "#A855F7",
	gradientEnd: "#D946EF",
	secondary: "#06B6D4",
	highlight: "#C084FC",
	warning: "#D946EF",
	error: "#EF4444",
	muted: "#6B7280",
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
