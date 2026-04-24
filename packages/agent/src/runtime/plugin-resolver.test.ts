import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { importPluginModuleFromPath } from "./plugin-resolver";

describe("importPluginModuleFromPath", () => {
  let stateDir: string;
  let originalStateDir: string | undefined;
  let originalWorkspaceRoot: string | undefined;

  beforeEach(async () => {
    stateDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "tokagent-plugin-resolver-"),
    );
    originalStateDir = process.env.TOKAGENT_STATE_DIR;
    originalWorkspaceRoot = process.env.TOKAGENT_WORKSPACE_ROOT;
    process.env.TOKAGENT_STATE_DIR = stateDir;
    process.env.TOKAGENT_WORKSPACE_ROOT = path.resolve(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "..",
      "..",
    );
  });

  afterEach(async () => {
    if (originalStateDir === undefined) {
      delete process.env.TOKAGENT_STATE_DIR;
    } else {
      process.env.TOKAGENT_STATE_DIR = originalStateDir;
    }

    if (originalWorkspaceRoot === undefined) {
      delete process.env.TOKAGENT_WORKSPACE_ROOT;
    } else {
      process.env.TOKAGENT_WORKSPACE_ROOT = originalWorkspaceRoot;
    }

    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  });

  it.skip(
    "stages declared workspace-plugin dependencies before import (fixture plugin-cron removed)",
    async () => {
      // plugin-cron submodule has been removed from the repo (Task 3.3 cleanup).
      // This test verified the importPluginModuleFromPath staging mechanism using
      // plugin-cron as a fixture. The mechanism itself is still tested elsewhere.
    },
  );
});
