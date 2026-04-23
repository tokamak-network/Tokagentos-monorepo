/**
 * Tokagent character catalog — single DeFi operator character.
 * Replaces the upstream elizaOS catalog with one character tuned for
 * Tokagent product use (perps / prediction markets / yield).
 */
import type { CharacterCatalogData } from "@elizaos/app-core";

export const TOKAGENT_CHARACTER_CATALOG: CharacterCatalogData = {
  assets: [
    {
      id: 0,
      slug: "tokagent-defi-operator",
      title: "Tokagent DeFi Operator",
      sourceName: "tokagent-operator",
    },
  ],
  injectedCharacters: [
    {
      name: "Tokagent",
      avatarAssetId: 0,
      catchphrase: "I run DeFi positions from chat.",
    },
  ],
};
