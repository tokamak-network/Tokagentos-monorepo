#!/usr/bin/env bun

/**
 * Test client for tokagentOS Vercel Edge Functions
 *
 * Usage:
 *   bun run test-client.ts                              # Test local dev server
 *   bun run test-client.ts --endpoint https://your-app.vercel.app  # Test deployed
 *
 * Environment:
 *   VERCEL_URL - Base URL for the Vercel deployment
 */

import * as readline from "node:readline";
import { parseArgs } from "node:util";

// Types
interface ChatResponse {
  response: string;
  conversationId: string;
  timestamp: string;
}

interface HealthResponse {
  status: string;
  runtime: string;
  version: string;
}

interface ErrorResponse {
  error: string;
  code: string;
}

// Parse command line arguments
const { values: args } = parseArgs({
  options: {
    endpoint: { type: "string", short: "e" },
    help: { type: "boolean", short: "h" },
    interactive: { type: "boolean", short: "i" },
  },
});

const DEFAULT_ENDPOINT = "http://localhost:3000";

function showHelp(): void {
  console.log(`
tokagentOS Vercel Edge Function Test Client

Usage:
  bun run test-client.ts [options]

Options:
  -e, --endpoint <url>   API endpoint URL (default: ${DEFAULT_ENDPOINT})
  -i, --interactive      Start interactive chat mode
  -h, --help             Show this help message

Examples:
  bun run test-client.ts                                    # Run tests against local
  bun run test-client.ts -e https://your-app.vercel.app     # Test deployed app
  bun run test-client.ts -i                                 # Interactive chat mode
`);
}

if (args.help) {
  showHelp();
  process.exit(0);
}

const baseUrl = args.endpoint ?? process.env.VERCEL_URL ?? DEFAULT_ENDPOINT;

console.log(`🔗 Using endpoint: ${baseUrl}\n`);

/**
 * Make an HTTP request to the API
 */
async function apiRequest<T>(
  path: string,
  method: string = "GET",
  body?: Record<string, unknown>,
): Promise<{ status: number; data: T }> {
  const url = `${baseUrl}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = (await response.json()) as T;

  return { status: response.status, data };
}

/**
 * Check if the server is available
 */
async function isServerAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run automated tests
 */
async function runTests(): Promise<void> {
  console.log("🧪 Testing tokagentOS Vercel Edge Functions\n");

  // Check if server is available
  const serverAvailable = await isServerAvailable();
  if (!serverAvailable) {
    console.log(`⚠️  Server not available at ${baseUrl}`);
    console.log("   Skipping integration tests (server must be running)");
    console.log("\n   To run these tests:");
    console.log("   1. Start the server: bun run dev");
    console.log("   2. Run tests: bun run test\n");
    console.log("✅ Tests skipped (no server running)\n");
    process.exit(0);
  }

  let passed = 0;
  let failed = 0;

  // Test 1: Health check
  console.log("1️⃣  Testing health check...");
  try {
    const { status, data } = await apiRequest<HealthResponse>("/api/health");
    console.log(`   Status: ${status}`);
    console.log(`   Runtime: ${data.runtime}`);
    console.log(`   Version: ${data.version}`);

    if (status === 200 && data.status === "healthy") {
      console.log("   ✅ Health check passed\n");
      passed++;
    } else {
      console.log("   ❌ Health check failed\n");
      failed++;
    }
  } catch (error) {
    console.log(
      `   ❌ Error: ${error instanceof Error ? error.message : "Unknown"}\n`,
    );
    failed++;
  }

  // Test 2: Chat endpoint
  console.log("2️⃣  Testing chat endpoint...");
  try {
    const start = Date.now();
    const { status, data } = await apiRequest<ChatResponse>(
      "/api/chat",
      "POST",
      {
        message: "Hello! What's 2 + 2?",
      },
    );
    const duration = Date.now() - start;

    console.log(`   Status: ${status}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Conversation ID: ${data.conversationId}`);
    console.log(
      `   Response: ${data.response.slice(0, 100)}${data.response.length > 100 ? "..." : ""}`,
    );

    if (status === 200 && data.response) {
      console.log("   ✅ Chat endpoint passed\n");
      passed++;
    } else {
      console.log("   ❌ Chat endpoint failed\n");
      failed++;
    }
  } catch (error) {
    console.log(
      `   ❌ Error: ${error instanceof Error ? error.message : "Unknown"}\n`,
    );
    failed++;
  }

  // Test 3: Validation (empty message)
  console.log("3️⃣  Testing validation (empty message)...");
  try {
    const { status, data } = await apiRequest<ErrorResponse>(
      "/api/chat",
      "POST",
      {
        message: "",
      },
    );
    console.log(`   Status: ${status}`);
    console.log(`   Error: ${data.error}`);

    if (status === 400 && data.code === "BAD_REQUEST") {
      console.log("   ✅ Validation passed\n");
      passed++;
    } else {
      console.log("   ❌ Validation failed\n");
      failed++;
    }
  } catch (error) {
    console.log(
      `   ❌ Error: ${error instanceof Error ? error.message : "Unknown"}\n`,
    );
    failed++;
  }

  // Test 4: 404 handling
  console.log("4️⃣  Testing 404 response...");
  try {
    const { status, data } = await apiRequest<ErrorResponse>("/api/unknown");
    console.log(`   Status: ${status}`);

    if (status === 404 && data.code === "NOT_FOUND") {
      console.log("   ✅ 404 handling passed\n");
      passed++;
    } else {
      console.log("   ❌ 404 handling failed\n");
      failed++;
    }
  } catch (error) {
    console.log(
      `   ❌ Error: ${error instanceof Error ? error.message : "Unknown"}\n`,
    );
    failed++;
  }

  // Test 5: Method not allowed
  console.log("5️⃣  Testing method not allowed...");
  try {
    const { status, data } = await apiRequest<ErrorResponse>(
      "/api/chat",
      "GET",
    );
    console.log(`   Status: ${status}`);

    if (status === 405 && data.code === "METHOD_NOT_ALLOWED") {
      console.log("   ✅ Method handling passed\n");
      passed++;
    } else {
      console.log("   ❌ Method handling failed\n");
      failed++;
    }
  } catch (error) {
    console.log(
      `   ❌ Error: ${error instanceof Error ? error.message : "Unknown"}\n`,
    );
    failed++;
  }

  // Summary
  console.log("━".repeat(40));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log("\n❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed!");
  }
}

/**
 * Interactive chat mode
 */
async function interactiveMode(): Promise<void> {
  console.log("💬 Interactive Chat Mode");
  console.log('   Type your message and press Enter. Type "exit" to quit.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let conversationId: string | undefined;

  const prompt = (): void => {
    rl.question("You: ", async (input: string) => {
      const message = input.trim();

      if (message.toLowerCase() === "exit") {
        console.log("\n👋 Goodbye!");
        rl.close();
        return;
      }

      if (!message) {
        prompt();
        return;
      }

      const { data } = await apiRequest<ChatResponse>("/api/chat", "POST", {
        message,
        conversationId,
      });

      conversationId = data.conversationId;
      console.log(`\nTokagent: ${data.response}\n`);

      prompt();
    });
  };

  prompt();
}

// Main
if (args.interactive) {
  interactiveMode();
} else {
  runTests();
}
