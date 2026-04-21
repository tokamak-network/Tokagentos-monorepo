#!/usr/bin/env bun
/**
 * Basic WASM Example
 *
 * Run with:
 *   bun run examples/wasm/basic.ts
 */

import * as tokagentos from "../../pkg-node/tokagentos.js";

async function main() {
  console.log("=== tokagentOS WASM Basic Example ===\n");

  console.log(`Version: ${tokagentos.getVersion()}`);

  console.log("\n--- UUID Operations ---");
  const uuid = tokagentos.generateUUID();
  console.log(`Generated UUID: ${uuid}`);
  console.log(`Is valid: ${tokagentos.validateUUID(uuid)}`);
  console.log(`Deterministic UUID: ${tokagentos.stringToUuid("my-agent-name")}`);

  console.log("\n--- Character Parsing ---");
  const character = tokagentos.parseCharacter(
    JSON.stringify({
      name: "BunAgent",
      bio: "A helpful agent running in Bun",
      system: "Be helpful and concise.",
    })
  );
  console.log(`Character name: ${character.name}`);

  console.log("\n--- Memory Round-Trip ---");
  const memory = tokagentos.parseMemory(
    JSON.stringify({
      entityId: tokagentos.generateUUID(),
      roomId: tokagentos.generateUUID(),
      content: { text: "Hello from Bun!" },
    })
  );
  const memoryJson = memory.toJson();
  console.log(`Memory JSON: ${memoryJson}`);

  console.log("\n=== Example Complete ===");
}

main().catch((err) => {
  console.error("Example failed:", err);
  process.exit(1);
});
