import process from "node:process";

function trimEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * App entrypoints should consistently default to the app namespace even
 * when they bypass the CLI/profile bootstrap path.
 */
export function ensureNamespaceDefaults(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const resolvedNamespace =
    trimEnvValue(env.TOKAGENT_NAMESPACE) ??
    trimEnvValue(env.TOKAGENT_NAMESPACE) ??
    "tokagent";

  if (!trimEnvValue(env.TOKAGENT_NAMESPACE)) {
    env.TOKAGENT_NAMESPACE = resolvedNamespace;
  }
  if (!trimEnvValue(env.TOKAGENT_NAMESPACE)) {
    env.TOKAGENT_NAMESPACE = resolvedNamespace;
  }
}

ensureNamespaceDefaults();
