/**
 * tokagentOS Runtime Service for React
 *
 * This module provides a simplified AgentRuntime instance configured for
 * browser use with PGlite database (in-memory WASM Postgres) and classic
 * TOKAGENT pattern matching.
 *
 * PGlite runs Postgres entirely in the browser via WASM - no server needed!
 */

import {
  AgentRuntime,
  ChannelType,
  type Character,
  type Content,
  createCharacter,
  createMessageMemory,
  type Memory,
  stringToUuid,
  type UUID,
} from "@tokagentos/core";
import {
  tokagentClassicPlugin,
  getTokagentGreeting,
} from "@elizaos/plugin-eliza-classic";
import sqlPlugin from "@elizaos/plugin-sql";
import { v4 as uuidv4 } from "uuid";
import { createBrowserPGlite } from "./pglite-browser";

// ============================================================================
// Types
// ============================================================================

export interface TokagentRuntimeState {
  isInitialized: boolean;
  isInitializing: boolean;
  error: Error | null;
}

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

// ============================================================================
// Character Configuration
// ============================================================================

const tokagentCharacter: Character = createCharacter({
  name: "TOKAGENT",
  bio: "A Rogerian psychotherapist simulation based on Joseph Weizenbaum's 1966 program. I use pattern matching to engage in therapeutic conversations.",
  system: `You are TOKAGENT, a Rogerian psychotherapist simulation. Your role is to:
- Listen empathetically to the user
- Reflect their statements back to them
- Ask open-ended questions to encourage self-exploration
- Never give direct advice or diagnoses
  - Focus on feelings and emotions`,
});

// ============================================================================
// Pre-initialize PGlite with browser-friendly asset loading
// ============================================================================

// Hook into the global singletons that plugin-sql uses
const GLOBAL_SINGLETONS = Symbol.for("@elizaos/plugin-sql/global-singletons");

interface PGliteClientManager {
  getConnection(): unknown;
  isShuttingDown(): boolean;
  initialize(): Promise<void>;
  close(): Promise<void>;
}

interface GlobalSingletons {
  pgLiteClientManager?: PGliteClientManager;
}

// Ensure the global singletons object exists
const globalSymbols = globalThis as typeof globalThis &
  Record<symbol, GlobalSingletons>;
if (!globalSymbols[GLOBAL_SINGLETONS]) {
  globalSymbols[GLOBAL_SINGLETONS] = {};
}

/**
 * Pre-initialize PGlite before the SQL plugin runs.
 * This ensures PGlite's WASM and data files are loaded from the correct location.
 */
async function preinitializePGlite(): Promise<void> {
  const singletons = globalSymbols[GLOBAL_SINGLETONS];

  // Only initialize if not already done
  if (singletons.pgLiteClientManager) {
    return;
  }

  console.log("[tokagentOS] Pre-initializing PGlite for browser...");

  // Create PGlite with our browser-friendly loader
  const pglite = await createBrowserPGlite();

  // Create a minimal client manager wrapper
  singletons.pgLiteClientManager = {
    getConnection: () => pglite,
    isShuttingDown: () => false,
    initialize: async () => {},
    close: async () => {
      await pglite.close();
    },
  };

  console.log("[tokagentOS] PGlite pre-initialized successfully");
}

// ============================================================================
// Runtime Singleton
// ============================================================================

let runtimeInstance: AgentRuntime | null = null;
let initializationPromise: Promise<AgentRuntime> | null = null;

// Session identifiers
const userId = uuidv4() as UUID;
const roomId = stringToUuid("tokagent-chat-room");
const worldId = stringToUuid("tokagent-chat-world");

/**
 * Get or create the AgentRuntime instance.
 * This is a singleton that is shared across the application.
 */
export async function getRuntime(): Promise<AgentRuntime> {
  // Return existing instance if available
  if (runtimeInstance) {
    return runtimeInstance;
  }

  // Return existing initialization promise if in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = initializeRuntime();
  runtimeInstance = await initializationPromise;
  initializationPromise = null;
  return runtimeInstance;
}

/**
 * Initialize a new AgentRuntime with PGlite and TOKAGENT plugins.
 */
async function initializeRuntime(): Promise<AgentRuntime> {
  console.log("[tokagentOS] Initializing AgentRuntime...");

  // Pre-initialize PGlite before the SQL plugin runs
  await preinitializePGlite();

  const runtime = new AgentRuntime({
    character: tokagentCharacter,
    plugins: [
      sqlPlugin, // PGlite database for browser (uses our pre-initialized instance)
      tokagentClassicPlugin, // Classic TOKAGENT pattern matching
    ],
  });

  await runtime.initialize();

  // Setup the chat connection
  await runtime.ensureConnection({
    entityId: userId,
    roomId,
    worldId,
    userName: "User",
    source: "react-client",
    channelId: "tokagent-chat",
    type: ChannelType.DM,
  });

  console.log("[tokagentOS] AgentRuntime initialized successfully");
  return runtime;
}

/**
 * Send a message to TOKAGENT and get a response.
 *
 * This uses the AgentRuntime's model system directly, which routes
 * to our classic TOKAGENT pattern matching plugin.
 *
 * @param text - The user's message
 * @param onChunk - Optional callback for streaming response chunks
 * @returns The complete TOKAGENT response
 */
export async function sendMessage(
  text: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const runtime = await getRuntime();

  if (!runtime.messageService) {
    throw new Error("Runtime message service not available");
  }

  const useStreaming = typeof onChunk === "function";
  let responseText = "";

  // Create message memory (the messageService will persist it)
  const messageMemory = createMessageMemory({
    id: uuidv4() as UUID,
    entityId: userId,
    roomId,
    content: {
      text,
      source: "client_chat",
      channelType: ChannelType.DM,
    },
  });

  const streamOptions = useStreaming
    ? {
        $typeName: "tokagent.v1.MessageProcessingOptions",
        onStreamChunk: async (chunk: string): Promise<void> => {
          responseText += chunk;
          onChunk?.(chunk);
        },
      }
    : undefined;

  const result = await runtime.messageService.handleMessage(
    runtime,
    messageMemory,
    async (content: Content): Promise<Memory[]> => {
      // In non-streaming mode, callback is typically called with the final reply.
      if (!useStreaming && typeof content.text === "string") {
        responseText = content.text;
      }
      return [];
    },
    streamOptions,
  );

  if (!responseText && typeof result.responseContent?.text === "string") {
    responseText = result.responseContent.text;
  }

  return responseText;
}

/**
 * Get the initial TOKAGENT greeting message.
 */
export function getGreeting(): string {
  return getTokagentGreeting();
}

/**
 * Check if the runtime is initialized.
 */
export function isRuntimeInitialized(): boolean {
  return runtimeInstance !== null;
}

/**
 * Stop and cleanup the runtime.
 */
export async function stopRuntime(): Promise<void> {
  if (runtimeInstance) {
    await runtimeInstance.stop();
    runtimeInstance = null;
  }
}
