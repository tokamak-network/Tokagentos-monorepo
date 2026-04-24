/**
 * Tokagent scaffold-patch: stub of upstream `FlaminaGuide`.
 *
 * Upstream's FlaminaGuide is an onboarding mascot + deferred-setup checklist
 * wired to the Eliza Cloud signup flow. The Tokagent product ships with
 * operator-wallet + env-var config instead — no cloud sign-in, no mascot.
 * We replace the file at scaffold time so both components render as empty
 * (React `null`). Upstream imports in App.tsx and state/ still typecheck.
 */

export function FlaminaGuideCard(_props: Record<string, unknown>): null {
	return null;
}

export function DeferredSetupChecklist(_props: Record<string, unknown>): null {
	return null;
}
