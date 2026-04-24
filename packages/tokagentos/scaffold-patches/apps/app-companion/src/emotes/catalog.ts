// Tokagent scaffold-patch: overlays the upstream elizaOS app-companion file
// in scaffolded projects. Source of truth lives at apps/app-companion/ in the
// tokagentos monorepo. Keep the two in sync — the monorepo edits do NOT
// automatically flow to scaffolded projects.

/**
 * Tokagent companion emote catalog.
 *
 * Reduced from upstream elizaOS's 41-entry social-companion set to 6 entries
 * mapped to agent runtime state transitions:
 *
 *   idle        — default when no other state is active
 *   thinking    — agent is running an action / tool call
 *   speaking    — agent is streaming a response
 *   acknowledge — user message received
 *   alert       — error / warning / pause
 *   success     — milestone / strategy executed
 *
 * Spec: docs/superpowers/specs/2026-04-24-companion-vrm-redesign-design.md §6.4
 *
 * All upstream exports preserved (EmoteDef, EmoteCategory, RAW_EMOTE_CATALOG,
 * EMOTE_CATALOG, AGENT_EMOTE_CATALOG, AGENT_EMOTE_EXCLUDED_IDS, EMOTE_BY_ID,
 * AGENT_EMOTE_BY_ID, getEmote, getEmotesByCategory, isValidEmote) so upstream
 * imports continue to compile without per-file patches.
 */

export type EmoteCategory =
  | "greeting"
  | "emotion"
  | "dance"
  | "combat"
  | "idle"
  | "movement"
  | "gesture"
  | "other";

export interface EmoteDef {
  id: string;
  name: string;
  description: string;
  /** Path to animation file served from the static renderer bundle. */
  path: string;
  duration: number;
  loop: boolean;
  category: EmoteCategory;
}

function gzipAnimationPath(path: string): string {
  return path.endsWith(".gz") ? path : `${path}.gz`;
}

const RAW_EMOTE_CATALOG: readonly EmoteDef[] = [
  {
    id: "idle",
    name: "Idle",
    description: "Stands idle",
    path: "/animations/idle.glb",
    duration: 5000,
    loop: true,
    category: "idle",
  },
  {
    id: "thinking",
    name: "Thinking",
    description: "Thinks with a hand to chin",
    path: "/animations/mixamo/Thinking.fbx",
    duration: 4000,
    loop: true,
    category: "idle",
  },
  {
    id: "speaking",
    name: "Talk",
    description: "Talks animatedly",
    path: "/animations/emotes/talk.glb",
    duration: 3000,
    loop: true,
    category: "idle",
  },
  {
    id: "acknowledge",
    name: "Acknowledging",
    description: "Acknowledges with a nod",
    path: "/animations/mixamo/Acknowledging.fbx",
    duration: 2000,
    loop: false,
    category: "greeting",
  },
  {
    id: "alert",
    name: "Surprised",
    description: "Reacts with surprise",
    path: "/animations/mixamo/Surprised.fbx",
    duration: 2000,
    loop: false,
    category: "emotion",
  },
  {
    id: "success",
    name: "Cheering",
    description: "Cheers with excitement",
    path: "/animations/mixamo/Cheering.fbx",
    duration: 3000,
    loop: false,
    category: "dance",
  },
];

export const EMOTE_CATALOG: EmoteDef[] = RAW_EMOTE_CATALOG.map((emote) => ({
  ...emote,
  path: gzipAnimationPath(emote.path),
}));

/**
 * Emotes the agent is allowed to trigger through PLAY_EMOTE.
 *
 * State-transition emotes (`idle`, `thinking`, `speaking`) are dispatched by
 * the runtime based on agent state — they are excluded here so the agent
 * cannot manually trigger them via PLAY_EMOTE (which would conflict with
 * runtime-driven state transitions and produce visual glitches).
 *
 * Expressive beats (`acknowledge`, `alert`, `success`) remain agent-callable:
 * the agent may want to celebrate a completed trade, signal an error state
 * proactively, or acknowledge a user's message with a visible reaction.
 */
export const AGENT_EMOTE_EXCLUDED_IDS = new Set(["idle", "thinking", "speaking"]);

export const AGENT_EMOTE_CATALOG = EMOTE_CATALOG.filter(
  (emote) => !AGENT_EMOTE_EXCLUDED_IDS.has(emote.id),
);

export const EMOTE_BY_ID = new Map<string, EmoteDef>(
  EMOTE_CATALOG.map((emote) => [emote.id, emote]),
);

export const AGENT_EMOTE_BY_ID = new Map<string, EmoteDef>(
  AGENT_EMOTE_CATALOG.map((emote) => [emote.id, emote]),
);

export function getEmote(id: string): EmoteDef | undefined {
  return EMOTE_BY_ID.get(id);
}

export function getEmotesByCategory(category: EmoteCategory): EmoteDef[] {
  return EMOTE_CATALOG.filter((emote) => emote.category === category);
}

export function isValidEmote(id: string): boolean {
  return EMOTE_BY_ID.has(id);
}
