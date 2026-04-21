#!/usr/bin/env bun
/**
 * WASM Runtime Example
 *
 * Run with:
 *   bun run examples/wasm/runtime.ts
 */

import * as tokagentos from "../../pkg-node/tokagentos.js";

async function main() {
  console.log("=== tokagentOS WASM Runtime Example ===\n");

  const characterJson = JSON.stringify({
    name: "RuntimeAgent",
    bio: "An agent demonstrating the WASM runtime lifecycle",
    system: "Be concise and friendly.",
  });

  const runtime = tokagentos.WasmAgentRuntime.create(characterJson);
  await runtime.initialize();

  const handler = new tokagentos.JsModelHandler({
    handle: async (paramsJson: string): Promise<string> => {
      const params = JSON.parse(paramsJson) as { prompt?: string };
      const prompt = params.prompt ?? "";
      return `Echo: ${prompt}`;
    },
  });

  runtime.registerModelHandler("TEXT_LARGE", handler);

  const messageJson = JSON.stringify({
    entityId: tokagentos.generateUUID(),
    roomId: tokagentos.generateUUID(),
    content: { text: "Hello from WASM!" },
  });

  const responseJson = await runtime.handleMessage(messageJson);
  const response = JSON.parse(responseJson) as {
    didRespond: boolean;
    responseContent: { text?: string };
  };

  console.log("Did respond:", response.didRespond);
  console.log("Response text:", response.responseContent.text ?? "");
}

main().catch((err) => {
  console.error("Example failed:", err);
  process.exit(1);
});
