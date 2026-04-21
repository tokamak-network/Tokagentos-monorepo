/**
 * Desktop Steward sidecar — implemented in `@tokagentos/app-steward`.
 * Re-exported here so consumers can import from `@tokagentos/app-core` only.
 */
export {
  createDesktopStewardSidecar,
  type StewardCredentials,
  StewardSidecar,
  type StewardSidecarConfig,
  type StewardSidecarStatus,
  type StewardWalletInfo,
} from "@tokagentos/app-steward/services/steward-sidecar";
