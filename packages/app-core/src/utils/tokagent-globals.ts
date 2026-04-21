export type TokagentWindow = Window & {
  __TOKAGENT_API_BASE__?: string;
  __TOKAGENT_API_TOKEN__?: string;
  __TOKAGENTOS_API_BASE__?: string;
  __TOKAGENTOS_API_TOKEN__?: string;
  __MILADY_API_BASE__?: string;
  __MILADY_API_TOKEN__?: string;
};

function getTokagentWindow(): TokagentWindow | null {
  return typeof window === "undefined" ? null : (window as TokagentWindow);
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getTokagentApiBase(): string | undefined {
  const tokagentWindow = getTokagentWindow();
  return (
    readTrimmedString(tokagentWindow?.__MILADY_API_BASE__) ??
    readTrimmedString(tokagentWindow?.__TOKAGENTOS_API_BASE__) ??
    readTrimmedString(tokagentWindow?.__TOKAGENT_API_BASE__)
  );
}

export function getTokagentApiToken(): string | undefined {
  const tokagentWindow = getTokagentWindow();
  return (
    readTrimmedString(tokagentWindow?.__MILADY_API_TOKEN__) ??
    readTrimmedString(tokagentWindow?.__TOKAGENTOS_API_TOKEN__) ??
    readTrimmedString(tokagentWindow?.__TOKAGENT_API_TOKEN__)
  );
}

export function setTokagentApiBase(value: string): void {
  const tokagentWindow = getTokagentWindow();
  if (tokagentWindow) {
    tokagentWindow.__TOKAGENTOS_API_BASE__ = value;
    tokagentWindow.__TOKAGENT_API_BASE__ = value;
  }
}

export function clearTokagentApiBase(): void {
  const tokagentWindow = getTokagentWindow();
  if (tokagentWindow) {
    delete tokagentWindow.__TOKAGENTOS_API_BASE__;
    delete tokagentWindow.__TOKAGENT_API_BASE__;
  }
}

export function setTokagentApiToken(value: string): void {
  const tokagentWindow = getTokagentWindow();
  if (tokagentWindow) {
    tokagentWindow.__TOKAGENTOS_API_TOKEN__ = value;
    tokagentWindow.__TOKAGENT_API_TOKEN__ = value;
  }
}

export function clearTokagentApiToken(): void {
  const tokagentWindow = getTokagentWindow();
  if (tokagentWindow) {
    delete tokagentWindow.__TOKAGENTOS_API_TOKEN__;
    delete tokagentWindow.__TOKAGENT_API_TOKEN__;
  }
}
