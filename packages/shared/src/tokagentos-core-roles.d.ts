/**
 * Ambient declaration for `@tokagentos/core/roles`.
 *
 * The published `@tokagentos/core@alpha` dist-tag declares `./roles` in
 * `dist/index.node.d.ts` but does not expose the subpath in its
 * `package.json` `exports` field, so tsc cannot resolve
 * `import { RolesConfig } from "@tokagentos/core/roles"` when this
 * package is built in isolation (as `tsc -p tsconfig.build.json`
 * does during the Docker CI build and the npm publish path). The
 * root `packages/agent/src/external-modules.d.ts` has a richer shim
 * but isn't part of this package's tsconfig include, so we mirror
 * the exports this package actually uses here.
 *
 * Keep this in sync with `packages/agent/src/external-modules.d.ts`
 * (or the upstream `tokagent/packages/typescript/src/roles.ts`) — only
 * add types that `packages/shared/src/config/types.tokagent.ts` (and any
 * future shared consumer) actually imports from the subpath.
 */

declare module "@tokagentos/core/roles" {
  export type RoleName = "OWNER" | "ADMIN" | "USER" | "GUEST";
  export type RoleGrantSource = "owner" | "manual" | "connector_admin";
  export type ConnectorAdminWhitelist = Record<string, string[]>;
  export interface RolesConfig {
    connectorAdmins?: ConnectorAdminWhitelist;
    [key: string]: unknown;
  }
}
