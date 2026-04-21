/** Heuristic: SSE `estimatedUsage.model` for Tokagent Cloud–hosted Kimi / moonshot routes. */
export function modelLooksLikeTokagentCloudHosted(
  model: string | undefined,
): boolean {
  if (!model || typeof model !== "string") return false;
  const m = model.toLowerCase();
  return (
    m.includes("kimi") ||
    m.includes("moonshot") ||
    (m.includes("tokagent") && m.includes("cloud"))
  );
}
