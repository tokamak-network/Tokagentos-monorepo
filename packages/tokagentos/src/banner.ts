import gradient from "gradient-string";
import { BANNER_LINES } from "./banner.generated.js";
import { c, palette } from "./theme.js";

// True when the banner should render — i.e. we're attached to a real TTY
// and the user hasn't opted out via NO_COLOR.
export function shouldShowBanner(): boolean {
	if (process.env.NO_COLOR) return false;
	if (!process.stdout.isTTY) return false;
	return true;
}

// Render the gradient TOKAGENTOS banner and attribution tagline.
// Returns an empty string when the banner should be suppressed (non-TTY,
// NO_COLOR, etc).
export function renderBanner(): string {
	if (!shouldShowBanner()) return "";
	const g = gradient([
		palette.gradientStart,
		palette.gradientMid,
		palette.gradientEnd,
	]);
	const banner = BANNER_LINES.map((line) => g(line)).join("\n");
	const tagline = `${c.muted("A fork of ")}${c.brand("elizaOS")}${c.muted(
		", restyled for Tokamak.",
	)}`;
	return `\n${banner}\n\n${tagline}\n\n`;
}
