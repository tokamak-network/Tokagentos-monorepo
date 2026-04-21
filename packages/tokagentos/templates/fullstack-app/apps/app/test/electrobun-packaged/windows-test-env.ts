const STRIPPED_ENV_KEYS = [
  "TOKAGENT_API_PORT",
  "TOKAGENT_PORT",
  "TOKAGENT_API_BASE",
  "TOKAGENT_API_BASE_URL",
  "TOKAGENT_API_PORT",
  "TOKAGENT_DESKTOP_API_BASE",
  "TOKAGENT_DESKTOP_TEST_PARTITION",
  "TOKAGENT_RENDERER_URL",
  "TOKAGENT_STARTUP_EVENTS_FILE",
  "TOKAGENT_STARTUP_SESSION_ID",
  "TOKAGENT_STARTUP_STATE_FILE",
  "TOKAGENT_TEST_WINDOWS_APPDATA_PATH",
  "TOKAGENT_TEST_WINDOWS_BACKEND_PORT",
  "TOKAGENT_TEST_WINDOWS_INSTALL_DIR",
  "TOKAGENT_TEST_WINDOWS_LAUNCHER_PATH",
  "TOKAGENT_TEST_WINDOWS_LOCALAPPDATA_PATH",
  "TOKAGENT_WINDOWS_SMOKE_REQUIRE_INSTALLER",
  "VITE_DEV_SERVER_URL",
] as const;

export function createPackagedWindowsAppEnv(args: {
  baseEnv: NodeJS.ProcessEnv;
  apiBase: string;
  appData: string;
  localAppData: string;
}): NodeJS.ProcessEnv {
  const env = {
    ...args.baseEnv,
  };

  for (const key of STRIPPED_ENV_KEYS) {
    delete env[key];
  }

  return {
    ...env,
    TOKAGENT_DESKTOP_TEST_API_BASE: args.apiBase,
    TOKAGENT_DESKTOP_TEST_PARTITION: "persist:bootstrap-isolated",
    TOKAGENT_DISABLE_LOCAL_EMBEDDINGS: "1",
    ELECTROBUN_CONSOLE: "1",
    // Redirect both Windows profile roots so the packaged shell and the
    // explicit bootstrap partition stay isolated from stale host-machine CEF
    // and runtime state on each test run.
    APPDATA: args.appData,
    LOCALAPPDATA: args.localAppData,
  };
}
