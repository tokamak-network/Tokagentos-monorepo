/**
 * Ambient declaration for `@tokagentos/core/roles`.
 *
 * Mirrors `packages/shared/src/tokagentos-core-roles.d.ts` and
 * `packages/agent/src/external-modules.d.ts`. See the long-form
 * rationale in either of those files. Published `@tokagentos/core@alpha`
 * does not expose `./roles` in its `exports` field, so this package
 * declares only what `src/access.ts` imports at the type level.
 */

export {};

declare module "@tokagentos/core/roles" {
  import type { IAgentRuntime, Memory } from "@tokagentos/core";

  export type RoleName = "OWNER" | "ADMIN" | "USER" | "GUEST";
  export function checkSenderRole(
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<{
    role: RoleName;
    isAdmin: boolean;
  } | null>;
}
