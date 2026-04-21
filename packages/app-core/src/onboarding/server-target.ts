export type OnboardingServerTarget = "" | "local" | "remote" | "tokagentcloud";

export function activeServerKindToOnboardingServerTarget(
  kind: "local" | "cloud" | "remote",
): Exclude<OnboardingServerTarget, ""> {
  switch (kind) {
    case "local":
      return "local";
    case "cloud":
      return "tokagentcloud";
    case "remote":
      return "remote";
  }
}
