import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  downloadsStagingDir,
  isWithinMiladyRoot,
  localInferenceRoot,
  miladyModelsDir,
  registryPath,
} from "./paths";

describe("paths", () => {
  let originalStateDir: string | undefined;

  beforeEach(() => {
    originalStateDir = process.env.TOKAGENT_STATE_DIR;
  });

  afterEach(() => {
    if (originalStateDir === undefined) {
      delete process.env.TOKAGENT_STATE_DIR;
    } else {
      process.env.TOKAGENT_STATE_DIR = originalStateDir;
    }
  });

  it("uses TOKAGENT_STATE_DIR when set", () => {
    process.env.TOKAGENT_STATE_DIR = "/custom/state";
    expect(localInferenceRoot()).toBe("/custom/state/local-inference");
    expect(miladyModelsDir()).toBe("/custom/state/local-inference/models");
    expect(downloadsStagingDir()).toBe(
      "/custom/state/local-inference/downloads",
    );
    expect(registryPath()).toBe("/custom/state/local-inference/registry.json");
  });

  it("falls back to ~/.tokagent/local-inference when unset", () => {
    delete process.env.TOKAGENT_STATE_DIR;
    expect(localInferenceRoot()).toBe(
      path.join(os.homedir(), ".tokagent", "local-inference"),
    );
  });

  it("isWithinMiladyRoot rejects the root itself and external paths", () => {
    process.env.TOKAGENT_STATE_DIR = "/state";
    expect(isWithinMiladyRoot("/state/local-inference")).toBe(false);
    expect(isWithinMiladyRoot("/state/local-inference/models/x.gguf")).toBe(
      true,
    );
    expect(isWithinMiladyRoot("/etc/passwd")).toBe(false);
    expect(isWithinMiladyRoot("/state/local-inference-evil")).toBe(false);
  });
});
