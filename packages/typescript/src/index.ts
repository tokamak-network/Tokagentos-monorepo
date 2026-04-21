/**
 * Main entry point for @tokagentos/core
 *
 * This is the default export that includes all modules.
 * The build system creates separate bundles for Node.js and browser environments.
 * Package.json conditional exports handle the routing to the correct build.
 *
 * This file re-exports from index.node.ts to ensure source-level imports work
 * correctly during builds when bundlers resolve against source files.
 */

// Re-export everything from the Node.js entry point
// This ensures that imports from "@tokagentos/core" resolve correctly during builds
export * from "./index.node";
