// Tokagent-specific overlay: native-plugin-entrypoints is a no-op.
//
// The upstream file side-effect-imports 15 `@elizaos/capacitor-*` packages
// (contacts, phone, system, messages, gateway, llama, etc.) to register
// native iOS/Android Capacitor bridges at module load. In the Tokagent
// product (desktop + web only), those native bridges are not needed and
// several of the `@elizaos/capacitor-*` packages don't have their dist/
// built during `bun run dev`, causing vite import-analysis to fail at
// page load with "Failed to resolve import @elizaos/capacitor-contacts".
//
// This overlay replaces the upstream file with an empty module so any
// code path that still imports `@elizaos/app-core/platform/native-plugin-entrypoints`
// (including upstream's own `tokagent/apps/app/src/main.tsx` which vite
// scans as part of the workspace) becomes a harmless no-op instead of
// pulling in 15 unbuilt capacitor side-effects.
//
// Capacitor packages used by specific product features (Agent, Desktop,
// App, Keyboard, StatusBar, etc. in our template main.tsx) resolve via
// their own named imports — those packages DO get built by the dev-ui
// pipeline. Only the bulk-registration file needed neutralizing.

export {};
