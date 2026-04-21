import { modelLooksLikeTokagentCloudHosted } from "@tokagentos/app-core";

export type CompanionInferenceNotice =
  | { kind: "cloud"; variant: "danger" | "warn"; tooltip: string }
  | { kind: "settings"; variant: "warn"; tooltip: string };

export function resolveCompanionInferenceNotice(args: {
  tokagentCloudConnected: boolean;
  tokagentCloudAuthRejected: boolean;
  tokagentCloudCreditsError: string | null | undefined;
  tokagentCloudEnabled: boolean;
  chatLastUsageModel?: string;
  hasInterruptedAssistant: boolean;
  t: (key: string) => string;
}): CompanionInferenceNotice | null {
  const {
    tokagentCloudConnected,
    tokagentCloudAuthRejected,
    tokagentCloudCreditsError,
    tokagentCloudEnabled,
    chatLastUsageModel,
    hasInterruptedAssistant,
    t,
  } = args;

  if (
    tokagentCloudConnected &&
    (tokagentCloudAuthRejected || Boolean(tokagentCloudCreditsError?.trim()))
  ) {
    return {
      kind: "cloud",
      variant: tokagentCloudAuthRejected ? "danger" : "warn",
      tooltip: tokagentCloudAuthRejected
        ? t("notice.tokagentCloudAuthRejected")
        : (tokagentCloudCreditsError?.trim() ?? ""),
    };
  }

  const disconnectedCloudRelevant =
    !tokagentCloudConnected &&
    (tokagentCloudEnabled || modelLooksLikeTokagentCloudHosted(chatLastUsageModel));

  if (disconnectedCloudRelevant) {
    return {
      kind: "cloud",
      variant: "warn",
      tooltip: t("chat.inferenceCloudNotConnected"),
    };
  }

  if (hasInterruptedAssistant) {
    return {
      kind: "settings",
      variant: "warn",
      tooltip: t("chat.inferenceStreamInterrupted"),
    };
  }

  return null;
}
