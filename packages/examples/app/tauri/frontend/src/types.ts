export type ProviderMode = "tokagentClassic" | "openai" | "xai";

export type ProviderSettings = {
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiSmallModel: string;
  openaiLargeModel: string;

  xaiApiKey: string;
  xaiBaseUrl: string;
  xaiSmallModel: string;
  xaiLargeModel: string;
};

export type AppConfig = {
  mode: ProviderMode;
  provider: ProviderSettings;
};

export const DEFAULT_CONFIG: AppConfig = {
  mode: "tokagentClassic",
  provider: {
    openaiApiKey: "",
    openaiBaseUrl: "https://api.openai.com/v1",
    openaiSmallModel: "gpt-5-mini",
    openaiLargeModel: "gpt-5",

    xaiApiKey: "",
    xaiBaseUrl: "https://api.x.ai/v1",
    xaiSmallModel: "grok-3-mini",
    xaiLargeModel: "grok-3",
  },
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
};

export function getModeLabel(mode: ProviderMode): string {
  switch (mode) {
    case "tokagentClassic":
      return "TOKAGENT (offline)";
    case "openai":
      return "OpenAI";
    case "xai":
      return "Grok (xAI)";
    default:
      return "TOKAGENT (offline)";
  }
}

