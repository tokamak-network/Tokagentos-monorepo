import type { RouteRequestContext } from "@tokagentos/agent/api";
import {
  type CharacterRouteContext as AutonomousCharacterRouteContext,
  type CharacterRouteState as AutonomousCharacterRouteState,
  handleCharacterRoutes as handleAutonomousCharacterRoutes,
} from "@tokagentos/agent/api/character-routes";
import type { TokagentConfig } from "@tokagentos/agent/config";
import { CharacterSchema } from "@tokagentos/agent/config";

export interface CharacterRouteState extends AutonomousCharacterRouteState {
  config?: TokagentConfig;
}

export interface CharacterRouteContext extends RouteRequestContext {
  state: CharacterRouteState;
  pickRandomNames: (count: number) => string[];
  saveConfig?: (config: TokagentConfig) => void;
}

function toAutonomousContext(
  ctx: CharacterRouteContext,
): AutonomousCharacterRouteContext {
  return {
    ...ctx,
    saveConfig: ctx.saveConfig
      ? (config) => ctx.saveConfig?.(config as TokagentConfig)
      : undefined,
    validateCharacter: (body) => CharacterSchema.safeParse(body) as never,
  };
}

export async function handleCharacterRoutes(
  ctx: CharacterRouteContext,
): Promise<boolean> {
  return handleAutonomousCharacterRoutes(toAutonomousContext(ctx));
}
