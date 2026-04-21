import type { GenerateTextParams, IAgentRuntime, Plugin } from "@tokagentos/core";
import { ModelType } from "@tokagentos/core";
import { generateTokagentResponse } from "@tokagentos/plugin-eliza-classic";

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function extractUserMessage(prompt: string): string {
  const match = prompt.match(/(?:User|Human|You):\s*(.+?)(?:\n|$)/i);
  return match ? match[1].trim() : prompt.trim();
}

async function handle(runtime: IAgentRuntime, params: GenerateTextParams): Promise<string> {
  const input = extractUserMessage(params.prompt);
  const reply = generateTokagentResponse(input);

  // The tokagentOS runtime expects an XML <response> block.
  // Keep it minimal: no actions, just text.
  return [
    "<response>",
    "<thought>Responding.</thought>",
    "<actions>REPLY</actions>",
    "<providers></providers>",
    `<text>${escapeXml(reply)}</text>`,
    "</response>",
  ].join("");
}

export const tokagentClassicXmlPlugin: Plugin = {
  name: "tokagent-classic-xml",
  description: "Wrap TOKAGENT classic responses in tokagentOS XML format",
  priority: 200,
  models: {
    [ModelType.TEXT_LARGE]: handle,
    [ModelType.TEXT_SMALL]: handle,
  },
};

