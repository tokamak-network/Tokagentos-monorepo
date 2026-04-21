/**
 * Experience learning — bundled with advanced capabilities (extended basic-capabilities).
 * Replaces the standalone `@tokagentos/plugin-experience` package for TypeScript core.
 */

export { recordExperienceAction } from "./actions/record-experience.ts";
export { experienceEvaluator } from "./evaluators/experienceEvaluator.ts";
export { experienceProvider } from "./providers/experienceProvider.ts";
// ExperienceService is lazy-loaded in advancedServices (advanced-capabilities/index.ts)
// to avoid circular dependency: @tokagentos/core → plugins → advanced-capabilities → experience/service → @tokagentos/core
export type { ExperienceService } from "./service.ts";
export * from "./types.ts";
