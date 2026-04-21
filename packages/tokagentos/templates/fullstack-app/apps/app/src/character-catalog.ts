/**
 * Tokagent character catalog derived from the shared character preset source.
 */
import type { CharacterCatalogData } from "@tokagentos/app-core";
import { buildTokagentCharacterCatalog } from "@tokagentos/shared/onboarding-presets";

export const TOKAGENT_CHARACTER_CATALOG: CharacterCatalogData =
  buildTokagentCharacterCatalog() as CharacterCatalogData;
