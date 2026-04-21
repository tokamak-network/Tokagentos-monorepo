import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTestEnv,
  resolveNodeCmd,
  runManagedTestCommand,
} from "./managed-test-command.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
// Script lives at tokagent/packages/app-core/test/scripts/ — repo root is 5 levels up
const repoRoot = path.resolve(here, "..", "..", "..", "..", "..");
const bunCmd = process.env.npm_execpath || process.env.BUN || "bun";
const nodeCmd = resolveNodeCmd();
const appRoot = path.join(repoRoot, "apps", "app");
const appCoreRoot = path.join(repoRoot, "tokagent", "packages", "app-core");
const tokagentRoot = path.join(repoRoot, "tokagent");
const cloudRoot = path.join(repoRoot, "tokagent", "cloud");
const stewardFiRoot = path.join(repoRoot, "tokagent", "steward-fi");
const unitShardCount = 1;

await runManagedTestCommand({
  repoRoot,
  lockName: "app-unit",
  label: "app-unit",
  command: nodeCmd,
  args: ["./node_modules/.bin/vitest", "run"],
  cwd: appRoot,
  env: buildTestEnv(appRoot),
});

const homepageRoot = path.join(repoRoot, "apps", "homepage");
await runManagedTestCommand({
  repoRoot,
  lockName: "homepage-unit",
  label: "homepage-unit",
  command: nodeCmd,
  args: ["./node_modules/.bin/vitest", "run"],
  cwd: homepageRoot,
  env: buildTestEnv(homepageRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "app-core-unit",
  label: "app-core-unit",
  command: nodeCmd,
  args: [
    "./node_modules/.bin/vitest",
    "run",
    "src/components/shell/ComputerUseApprovalOverlay.test.tsx",
  ],
  cwd: appCoreRoot,
  env: buildTestEnv(appCoreRoot),
});

for (let shard = 1; shard <= unitShardCount; shard += 1) {
  await runManagedTestCommand({
    repoRoot,
    lockName: `unit-${shard}`,
    label: `unit ${shard}/${unitShardCount}`,
    command: nodeCmd,
    args: [
      "./node_modules/.bin/vitest",
      "run",
      "--config",
      "test/vitest/default.config.ts",
      `--shard=${shard}/${unitShardCount}`,
    ],
    cwd: repoRoot,
    env: buildTestEnv(repoRoot),
  });
}

await runManagedTestCommand({
  repoRoot,
  lockName: "integration",
  label: "integration",
  command: bunCmd,
  args: ["run", "test:integration"],
  cwd: repoRoot,
  env: buildTestEnv(repoRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "e2e-all",
  label: "e2e-all",
  command: bunCmd,
  args: ["run", "test:e2e:all"],
  cwd: repoRoot,
  env: buildTestEnv(repoRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "scenarios-all",
  label: "scenarios-all",
  command: bunCmd,
  args: ["run", "test:scenarios"],
  cwd: repoRoot,
  env: buildTestEnv(repoRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "live-smoke",
  label: "live-smoke",
  command: bunCmd,
  args: ["run", "test:live:smoke"],
  cwd: repoRoot,
  env: {
    ...buildTestEnv(repoRoot),
    MILADY_LIVE_TEST: "1",
    TOKAGENT_LIVE_TEST: "1",
  },
});

await runManagedTestCommand({
  repoRoot,
  lockName: "evm-live-rpc",
  label: "evm-live-rpc",
  command: bunCmd,
  args: ["run", "test:live:evm:rpc"],
  cwd: repoRoot,
  env: {
    ...buildTestEnv(repoRoot),
    MILADY_LIVE_TEST: "1",
    TOKAGENT_LIVE_TEST: "1",
  },
});

await runManagedTestCommand({
  repoRoot,
  lockName: "evm-live-transfer",
  label: "evm-live-transfer",
  command: bunCmd,
  args: [
    "x",
    "vitest",
    "run",
    "--config",
    "test/vitest/real.config.ts",
    "tokagent/plugins/plugin-evm/typescript/__tests__/integration/transfer.live.test.ts",
  ],
  cwd: repoRoot,
  env: {
    ...buildTestEnv(repoRoot),
    MILADY_LIVE_TEST: "1",
    TOKAGENT_LIVE_TEST: "1",
  },
});

await runManagedTestCommand({
  repoRoot,
  lockName: "ui-playwright",
  label: "ui-playwright",
  command: bunCmd,
  args: ["run", "test:ui:playwright"],
  cwd: repoRoot,
  env: buildTestEnv(repoRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "orchestrator-integration",
  label: "orchestrator-integration",
  command: bunCmd,
  args: ["run", "test:orchestrator:integration"],
  cwd: repoRoot,
  env: buildTestEnv(repoRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "tokagent-all",
  label: "tokagent-all",
  command: bunCmd,
  args: ["run", "test"],
  cwd: tokagentRoot,
  env: buildTestEnv(tokagentRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "cloud-all",
  label: "cloud-all",
  command: bunCmd,
  args: ["run", "test"],
  cwd: cloudRoot,
  env: buildTestEnv(cloudRoot),
});

await runManagedTestCommand({
  repoRoot,
  lockName: "steward-fi-all",
  label: "steward-fi-all",
  command: bunCmd,
  args: ["run", "test"],
  cwd: stewardFiRoot,
  env: buildTestEnv(stewardFiRoot),
});
