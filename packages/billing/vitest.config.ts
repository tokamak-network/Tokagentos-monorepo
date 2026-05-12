import { defineConfig } from "vitest/config";

/**
 * Vitest config — minimal.
 *
 * Decision Z45 (Phase 8): `fileParallelism` override removed.
 *
 * Phase 5.1 set `fileParallelism: false` to prevent port-collision between
 * the two Anvil integration tests, both of which were targeting hardcoded
 * port 8545. The `pkill -9 -f anvil` in the harness (Decision Z24) then
 * killed the other file's Anvil mid-deploy, producing "nonce too low" errors.
 *
 * Phase 8 (Decision Z45) replaces the hardcoded port with `pickFreePort()`
 * (OS-assigned ephemeral port). Each test file's Anvil instance now binds to
 * a distinct port, eliminating the race. The `pkill -9 -f anvil` step is also
 * removed. Vitest can therefore run files in parallel again.
 *
 * Leaving `fileParallelism` unset restores the vitest default (true for
 * multi-process mode). The integration test suite is still env-gated by
 * `BILLING_TEST_ANVIL=1` so parallel execution only matters for CI runs that
 * explicitly opt in.
 */
export default defineConfig({
  test: {
    // fileParallelism: false  — removed per Decision Z45
  },
});
