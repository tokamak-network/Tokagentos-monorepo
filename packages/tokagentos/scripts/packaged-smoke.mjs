import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const tmpBaseDir =
  process.env.TOKAGENTOS_SMOKE_TMPDIR ||
  (fs.existsSync("/tmp") ? "/tmp" : os.tmpdir());
const tmpRoot = fs.mkdtempSync(
  path.join(tmpBaseDir, "tokagentos-packaged-smoke-"),
);
const shouldKeepTemp = process.env.TOKAGENTOS_SMOKE_KEEP_TEMP === "1";
const shouldInstallGeneratedFullstack =
  process.env.TOKAGENTOS_SMOKE_FULLSTACK_INSTALL === "1";
const shouldUseRemoteUpstream =
  process.env.TOKAGENTOS_SMOKE_REMOTE_UPSTREAM === "1";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const tokagentosBinName =
  process.platform === "win32" ? "tokagentos.cmd" : "tokagentos";
const localUpstreamRepo = path.resolve(packageDir, "..", "..");
const useLocalUpstream =
  !shouldUseRemoteUpstream &&
  fs.existsSync(
    path.join(localUpstreamRepo, "packages", "app-core", "package.json"),
  );
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function getTarballName(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const tarball = [...lines].reverse().find((line) => line.endsWith(".tgz"));
  if (!tarball) {
    throw new Error(
      `Unable to determine tarball name from npm pack output:\n${output}`,
    );
  }
  return tarball;
}

function assertPathExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Expected path to exist: ${targetPath}`);
  }
}

async function main() {
  let passed = false;

  try {
    run("bun", ["run", "build"], { cwd: packageDir });

    const packOutput = run(npmCommand, [
      "pack",
      packageDir,
      "--pack-destination",
      tmpRoot,
    ]);
    const tarballName = getTarballName(packOutput);
    const tarballPath = path.join(tmpRoot, tarballName);
    const smokeDir = path.join(tmpRoot, "smoke");
    fs.mkdirSync(smokeDir, { recursive: true });
    fs.writeFileSync(
      path.join(smokeDir, "package.json"),
      `${JSON.stringify({ name: "tokagentos-packaged-smoke", private: true }, null, 2)}\n`,
    );
    run(npmCommand, ["install", tarballPath], { cwd: smokeDir });

    const installedPkgDir = path.join(
      smokeDir,
      "node_modules",
      "@tokagent",
      "tokagentos",
    );

    // 1. Binary arg-parse smoke: --help and -v must work from the packaged bin.
    const binPath = path.join(smokeDir, "node_modules", ".bin", tokagentosBinName);
    const helpOut = run(binPath, ["--help"], { cwd: smokeDir });
    if (/\b(upgrade|info|plugin)\b/.test(helpOut)) {
      throw new Error(
        `--help still advertises removed surface:\n${helpOut}`,
      );
    }
    run(binPath, ["-v"], { cwd: smokeDir });

    // 2. Scaffold-fn smoke: drive the headless core with fixed inputs.
    //    Redirect HOME so preCompleteOnboarding writes under the temp dir.
    const fakeHome = path.join(tmpRoot, "home");
    fs.mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    if (useLocalUpstream) {
      process.env.TOKAGENTOS_UPSTREAM_REPO =
        process.env.TOKAGENTOS_UPSTREAM_REPO || localUpstreamRepo;
      if (process.env.TOKAGENTOS_UPSTREAM_BRANCH === undefined) {
        process.env.TOKAGENTOS_UPSTREAM_BRANCH = "";
      }
      if (process.env.TOKAGENTOS_UPSTREAM_COMMIT === undefined) {
        process.env.TOKAGENTOS_UPSTREAM_COMMIT = "";
      }
      // The local monorepo already has Tokagent-specific content so the
      // surgical-patch find-strings don't match upstream originals. Skip
      // them; production runs against the pinned remote commit don't set this.
      if (process.env.TOKAGENTOS_SKIP_SURGICAL_PATCHES === undefined) {
        process.env.TOKAGENTOS_SKIP_SURGICAL_PATCHES = "1";
      }
    }

    const fullstackInstallEnv = {
      ...process.env,
      MILADY_NO_VISION_DEPS: process.env.MILADY_NO_VISION_DEPS || "1",
      SKIP_AVATAR_CLONE: process.env.SKIP_AVATAR_CLONE || "1",
    };

    const workspaceDir = path.join(smokeDir, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });

    const mod = await import(
      pathToFileURL(path.join(installedPkgDir, "dist", "index.js")).href
    );
    const { projectDir, envVarWritten } = mod.scaffoldProject({
      cwd: workspaceDir,
      projectName: "fullstack-demo",
      providerId: "anthropic",
      apiKey: "sk-ant-smoke",
    });

    assertPathExists(path.join(projectDir, "package.json"));
    assertPathExists(path.join(projectDir, "apps", "app", "package.json"));
    assertPathExists(path.join(projectDir, "tokagent"));
    assertPathExists(path.join(projectDir, ".env"));
    const dotEnvContent = fs.readFileSync(path.join(projectDir, ".env"), "utf8");
    if (!/^ANTHROPIC_API_KEY=sk-ant-smoke$/m.test(dotEnvContent)) {
      throw new Error(`.env missing ANTHROPIC_API_KEY line:\n${dotEnvContent}`);
    }
    if (envVarWritten !== "ANTHROPIC_API_KEY") {
      throw new Error(`unexpected envVarWritten: ${envVarWritten}`);
    }

    if (shouldInstallGeneratedFullstack) {
      run("bun", ["install"], { cwd: projectDir, env: fullstackInstallEnv });
      run("bun", ["run", "typecheck"], {
        cwd: projectDir,
        env: fullstackInstallEnv,
      });
      run("bun", ["run", "build"], {
        cwd: projectDir,
        env: fullstackInstallEnv,
      });
    }

    passed = true;
    console.log("tokagentos packaged smoke test passed");
  } finally {
    if (!shouldKeepTemp && passed) {
      fs.rmSync(tmpRoot, { force: true, recursive: true });
    } else if (!passed || shouldKeepTemp) {
      console.log(`tokagentos packaged smoke temp dir: ${tmpRoot}`);
    }
  }
}

await main();
