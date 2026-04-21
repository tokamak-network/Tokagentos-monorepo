import { resolveTokagentVersion } from "@tokagentos/agent/version-resolver";

export const CLI_VERSION = resolveTokagentVersion(import.meta.url);
