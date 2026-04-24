/**
 * Tokagent scaffold-patch: stub of upstream `CloudStatusBadge`.
 *
 * The Tokagent product does not have a managed-cloud surface — there's no
 * "Eliza Cloud" service to show status for. The upstream component renders a
 * badge in the shell header advertising cloud connection/credits. We replace
 * the file at scaffold time so the badge renders as empty (React `null`) and
 * the surrounding header layout reflows cleanly.
 *
 * All exported symbols are preserved so upstream imports continue to
 * typecheck; components render null, helpers return inert defaults.
 */

export interface CloudStatusBadgeProps {
	connected: boolean;
	credits: number | null;
	creditsLow: boolean;
	creditsCritical: boolean;
	authRejected: boolean;
	creditsError?: string | null;
	compactOnMobile?: boolean;
	appearance?: "default" | "shell";
	t: (key: string) => string;
	onClick: () => void;
	dataTestId?: string;
}

export function formatCompactCloudCredits(_balance: number): string {
	return "";
}

export function resolveCloudStatusBadgeState(_args: {
	connected: boolean;
	credits: number | null;
	creditsLow: boolean;
	creditsCritical: boolean;
	authRejected: boolean;
	creditsError?: string | null;
	t: (key: string) => string;
}): null {
	return null;
}

export function CloudStatusBadge(_props: CloudStatusBadgeProps): null {
	return null;
}
