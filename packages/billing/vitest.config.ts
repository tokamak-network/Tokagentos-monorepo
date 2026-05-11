import { defineConfig } from "vitest/config";

/**
 * Vitest config — minimal.
 *
 * `fileParallelism: false` (Phase 5.2): vitest defaults to running test files
 * in parallel. The two Anvil integration tests
 * (`chain/__tests__/vault.integration.test.ts` and
 *  `workers/__tests__/consume-worker.integration.test.ts`) both spawn anvil
 * on hardcoded port 8545, AND the harness's defensive `pkill -9 -f anvil`
 * (Decision Z24) kills the other file's anvil mid-deploy. The race produces
 * "nonce too low" forge errors that look like test bugs.
 *
 * Serializing files eliminates both the port and the pkill race. The cost is
 * ~half-second longer on a fully-parallel-friendly run, which is irrelevant
 * for a 9-test integration suite. Phase 8 random-port selection will revisit.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
