/**
 * Skill slash-command dispatch action.
 *
 * When the user types `/<skill-slug> <args>`, this action bypasses normal LLM
 * routing and immediately loads the skill's full instructions, then responds
 * with the skill context + user args so the agent can act on them directly.
 *
 * Skill slugs were previously registered via the plugin-commands integration, which was
 * removed in Task 3.3. The action is now dormant (validate() always returns false) but
 * kept in place so the plugin structure remains intact.
 */

import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@tokagentos/core";
import { logger } from "@tokagentos/core";
import { hasRoleAccess } from "../security/access.js";
import type { AgentSkillsServiceLike } from "../types/agent-skills.js";

/**
 * Set of registered skill slugs.
 * Previously populated via plugin-commands integration (removed in Task 3.3).
 * Kept as an empty set so skillCommandAction validate() gracefully returns false.
 */
const registeredSkillSlugs = new Set<string>();

/**
 * Extract skill slug from a slash-command message.
 * Returns null if the message doesn't match a registered skill.
 */
function extractSkillSlug(text: string): { slug: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;

  // Extract the command part (everything up to first space)
  const spaceIdx = trimmed.indexOf(" ");
  const commandPart =
    spaceIdx === -1 ? trimmed.substring(1) : trimmed.substring(1, spaceIdx);
  const args = spaceIdx === -1 ? "" : trimmed.substring(spaceIdx + 1).trim();

  const slug = commandPart.toLowerCase();
  if (registeredSkillSlugs.has(slug)) {
    return { slug, args };
  }
  return null;
}

export const skillCommandAction: Action = {
  name: "SKILL_COMMAND",
  similes: ["/skill"],
  description:
    "Dispatch a slash command to an installed skill. Loads the skill's instructions and responds with contextual guidance.",

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    if (!(await hasRoleAccess(runtime, message, "ADMIN"))) {
      return false;
    }

    const text = (message.content as Record<string, unknown>)?.text;
    if (typeof text !== "string") return false;
    return extractSkillSlug(text) !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    if (!(await hasRoleAccess(runtime, message, "ADMIN"))) {
      const text =
        "Permission denied: slash skill commands require owner or admin access.";
      await callback?.({ text });
      return { success: false, text };
    }

    const text =
      ((message.content as Record<string, unknown>)?.text as string) ?? "";
    const match = extractSkillSlug(text);
    if (!match) {
      await callback?.({
        text: "Could not identify a skill command. Use /help to see available commands.",
      });
      return;
    }

    const service = runtime.getService(
      "AGENT_SKILLS_SERVICE",
    ) as unknown as AgentSkillsServiceLike | null;

    if (!service) {
      await callback?.({
        text: "Skills service is not available. The agent is still starting up.",
      });
      return;
    }

    const instructions = service.getSkillInstructions(match.slug);
    if (!instructions?.body) {
      await callback?.({
        text: `Skill "${match.slug}" is registered but has no instructions available.`,
      });
      return;
    }

    // Cap instructions to keep context reasonable
    const maxChars = 3000;
    const body =
      instructions.body.length > maxChars
        ? `${instructions.body.substring(0, maxChars)}\n\n...[truncated — full instructions available via USE_SKILL]`
        : instructions.body;

    // Find the skill name for display
    const skills = service.getLoadedSkills();
    const skill = skills.find((s) => s.slug.toLowerCase() === match.slug);
    const skillName = skill?.name ?? match.slug;

    logger.info(
      `[skill-command] Dispatching /${match.slug}${match.args ? ` ${match.args}` : ""}`,
    );

    // Inject the skill instructions + user's request as a structured prompt
    const userRequest = match.args || "General help with this skill";
    const response = [
      `## Skill: ${skillName}`,
      "",
      body,
      "",
      `---`,
      "",
      `**User request:** ${userRequest}`,
      "",
      `Follow the skill instructions above to help with this request. If the skill requires specific tools or CLI commands, explain what needs to happen.`,
    ].join("\n");

    await callback?.({
      text: response,
      actions: ["SKILL_COMMAND"],
    });
  },

  parameters: [],
  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "/github create an issue about the login bug" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "## Skill: GitHub\n\n[github skill instructions]\n\n---\n\n**User request:** create an issue about the login bug",
          actions: ["SKILL_COMMAND"],
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "/weather tokyo" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "## Skill: Weather\n\n[weather skill instructions]\n\n---\n\n**User request:** tokyo",
          actions: ["SKILL_COMMAND"],
        },
      },
    ],
  ],
};
