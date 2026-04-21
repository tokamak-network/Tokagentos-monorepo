/**
 * Tokagent character catalog derived from the shared character preset source.
 */
import type { CharacterCatalogData } from "@elizaos/app-core";
import { buildTokagentCharacterCatalog } from "@elizaos/shared/onboarding-presets";

export const TOKAGENT_CHARACTER_CATALOG: CharacterCatalogData =
  buildTokagentCharacterCatalog() as CharacterCatalogData;
