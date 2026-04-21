#!/usr/bin/env bun
/**
 * WASM Benchmark Example
 *
 * Run with:
 *   bun run examples/wasm/benchmark.ts
 */

import * as tokagentos from "../../pkg-node/tokagentos.js";

async function main() {
  console.log("=== tokagentOS WASM Benchmark ===\n");

  const runtime = tokagentos.WasmAgentRuntime.create(
    JSON.stringify({
      name: "BenchBot",
      bio: "Benchmark agent",
      system: "Respond with short text only.",
    })
  );
  await runtime.initialize();

  const handler = new tokagentos.JsModelHandler({
    handle: async (paramsJson: string): Promise<string> => {
      const params = JSON.parse(paramsJson) as { prompt?: string };
      const prompt = params.prompt ?? "";
      return `Ack: ${prompt.length}`;
    },
  });

  runtime.registerModelHandler("TEXT_LARGE", handler);

  const iterations = 100;
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    const messageJson = JSON.stringify({
      entityId: tokagentos.generateUUID(),
      roomId: tokagentos.generateUUID(),
      content: { text: `Hello ${i}` },
    });
    await runtime.handleMessage(messageJson);
  }

  const elapsedMs = performance.now() - start;
  const perRequestMs = elapsedMs / iterations;

  console.log(`Iterations: ${iterations}`);
  console.log(`Total time: ${elapsedMs.toFixed(2)} ms`);
  console.log(`Per request: ${perRequestMs.toFixed(2)} ms`);

  console.log("\n--- JSON Round-Trip ---");
  const memoryJson = JSON.stringify({
    entityId: tokagentos.generateUUID(),
    roomId: tokagentos.generateUUID(),
    content: { text: "Round trip" },
  });
  const memory = tokagentos.parseMemory(memoryJson);
  const roundTrip = memory.toJson();
  console.log(`Round-trip bytes: ${roundTrip.length}`);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
