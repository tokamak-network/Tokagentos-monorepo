export function buildVisionDepsFailureMessage(
  error,
  command = "node scripts/ensure-vision-deps.mjs",
) {
  const detail =
    error instanceof Error ? error.message : String(error ?? "unknown error");

  return [
    "",
    "  [tokagent] Vision dependency auto-install failed.",
    "  [tokagent] Camera and vision features will be unavailable in this session until the native tools are installed.",
    `  [tokagent] Retry manually: ${command}`,
    `  [tokagent] Failure detail: ${detail}`,
  ].join("\n");
}
