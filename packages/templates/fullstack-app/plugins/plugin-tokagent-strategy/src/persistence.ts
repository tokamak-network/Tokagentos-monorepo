import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { AgentRuntimeLike } from "@tokagent/plugin-tokagent-shared";
import type { Strategy, StrategyTickEntry } from "./types.js";

// Re-export AgentRuntimeLike so callers can import it from this module
export type { AgentRuntimeLike } from "@tokagent/plugin-tokagent-shared";

// ─── Zod schemas ────────────────────────────────────────────────────────────

const StrategyTickEntrySchema = z.object({
  at: z.number(),
  action: z.string(),
  result: z.string(),
});

const BacktestRunSchema = z.object({
  runAt: z.number(),
  rangeFromMs: z.number(),
  rangeToMs: z.number(),
  totalTicks: z.number(),
  signalCount: z.number(),
  pnlPctHypothetical: z.number(),
  sharpeHypothetical: z.number(),
  maxDrawdownPct: z.number(),
  summary: z.string(),
  warnings: z.array(z.string()),
});

export const STRATEGY_SCHEMA: z.ZodType<Strategy> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(["perp-funding-arb", "yield-auto-compound", "polymarket-value-hunt"]),
  params: z.record(z.unknown()),
  vault: z.object({
    chainId: z.number(),
    address: z.string().refine((v): v is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(v), {
      message: "vault.address must be a valid EVM address",
    }),
  }),
  schedule: z.object({ everyMs: z.number().positive() }),
  status: z.enum(["draft", "testing", "active", "paused", "stopped"]),
  createdAt: z.number(),
  lastTickAt: z.number().optional(),
  lastError: z.string().optional(),
  tickHistory: z.array(StrategyTickEntrySchema),
  backtestResults: z.array(BacktestRunSchema).optional(),
}) as z.ZodType<Strategy>;

// ─── In-process mutex ────────────────────────────────────────────────────────

// Single-process mutex: serialises all file writes via a promise chain.
let _writeMutex: Promise<void> = Promise.resolve();

function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = _writeMutex.then(() => fn());
  // Keep the mutex chain alive even if fn() throws.
  _writeMutex = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// ─── Path resolution ─────────────────────────────────────────────────────────

function resolveDataDir(runtime: AgentRuntimeLike): string {
  const setting = runtime.getSetting("TOKAGENT_DATA_DIR");
  return setting ?? join(process.env.HOME ?? "/tmp", ".tokagent");
}

function resolveFilePath(runtime: AgentRuntimeLike): string {
  return join(resolveDataDir(runtime), "strategies.json");
}

// ─── Raw read/write ──────────────────────────────────────────────────────────

async function readRaw(runtime: AgentRuntimeLike): Promise<Strategy[]> {
  const filePath = resolveFilePath(runtime);
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (err: unknown) {
    // ENOENT → no strategies yet
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.warn(`[strategy-persistence] read error: ${err}`);
    return [];
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    console.warn(`[strategy-persistence] parse error: ${err}. Returning empty list.`);
    return [];
  }

  if (!Array.isArray(raw)) {
    console.warn("[strategy-persistence] strategies.json is not an array. Returning empty list.");
    return [];
  }

  const valid: Strategy[] = [];
  for (const entry of raw) {
    const result = STRATEGY_SCHEMA.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    } else {
      console.warn(`[strategy-persistence] dropping invalid strategy entry: ${result.error.message}`);
    }
  }
  return valid;
}

async function writeRaw(runtime: AgentRuntimeLike, strategies: Strategy[]): Promise<void> {
  const filePath = resolveFilePath(runtime);
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  const content = JSON.stringify(strategies, null, 2);
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, filePath);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Load all strategies. Returns [] if file doesn't exist or is malformed. */
export async function loadStrategies(runtime: AgentRuntimeLike): Promise<Strategy[]> {
  return readRaw(runtime);
}

/** Upsert a strategy by id. */
export async function saveStrategy(runtime: AgentRuntimeLike, strategy: Strategy): Promise<void> {
  return withMutex(async () => {
    const all = await readRaw(runtime);
    const idx = all.findIndex((s) => s.id === strategy.id);
    if (idx >= 0) {
      all[idx] = strategy;
    } else {
      all.push(strategy);
    }
    await writeRaw(runtime, all);
  });
}

/** Delete a strategy by id. Returns true if found and deleted, false otherwise. */
export async function deleteStrategy(runtime: AgentRuntimeLike, id: string): Promise<boolean> {
  return withMutex(async () => {
    const all = await readRaw(runtime);
    const idx = all.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    all.splice(idx, 1);
    await writeRaw(runtime, all);
    return true;
  });
}

/** Get a strategy by id. Returns undefined if not found. */
export async function getStrategy(
  runtime: AgentRuntimeLike,
  id: string,
): Promise<Strategy | undefined> {
  const all = await readRaw(runtime);
  return all.find((s) => s.id === id);
}

/** List strategies with status "active" or "testing". */
export async function listActiveStrategies(runtime: AgentRuntimeLike): Promise<Strategy[]> {
  const all = await readRaw(runtime);
  return all.filter((s) => s.status === "active" || s.status === "testing");
}

/**
 * Update a strategy by id with a partial patch.
 * Throws if the strategy is not found.
 */
export async function updateStrategy(
  runtime: AgentRuntimeLike,
  id: string,
  patch: Partial<Strategy>,
): Promise<Strategy> {
  return withMutex(async () => {
    const all = await readRaw(runtime);
    const idx = all.findIndex((s) => s.id === id);
    if (idx < 0) {
      throw new Error(`Strategy not found: ${id}`);
    }
    const updated: Strategy = { ...all[idx], ...patch };
    all[idx] = updated;
    await writeRaw(runtime, all);
    return updated;
  });
}

/** Append a tick entry to a strategy's tickHistory, capping at 50 entries. */
export async function appendTick(
  runtime: AgentRuntimeLike,
  id: string,
  entry: StrategyTickEntry,
): Promise<void> {
  return withMutex(async () => {
    const all = await readRaw(runtime);
    const idx = all.findIndex((s) => s.id === id);
    if (idx < 0) {
      // Strategy was deleted — silently ignore.
      return;
    }
    const history = [...all[idx].tickHistory, entry];
    // Cap at 50 most recent entries
    all[idx] = { ...all[idx], tickHistory: history.slice(-50) };
    await writeRaw(runtime, all);
  });
}
