import { Service, type IAgentRuntime } from "@elizaos/core";
import { appendTick, listActiveStrategies, updateStrategy, type AgentRuntimeLike } from "../persistence.js";
import { getKind } from "../kind-registry.js";
import type { Strategy } from "../types.js";

const TICK_INTERVAL_MS = 60_000;

/** Adapt IAgentRuntime.getSetting (returns string|number|boolean|null) to AgentRuntimeLike. */
function toRuntimeLike(runtime: IAgentRuntime): AgentRuntimeLike {
  return {
    getSetting: (key: string): string | undefined => {
      const v = runtime.getSetting(key);
      if (v === null || v === undefined) return undefined;
      return String(v) || undefined;
    },
  };
}

export class StrategyRunnerService extends Service {
  static serviceType = "tokagent-strategy-runner";
  capabilityDescription = "Runs registered DeFi strategies on a periodic tick loop.";
  private timer: ReturnType<typeof setInterval> | null = null;

  static async start(runtime: IAgentRuntime): Promise<StrategyRunnerService> {
    const svc = new StrategyRunnerService(runtime);
    await svc.initialize();
    return svc;
  }

  async initialize(): Promise<void> {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
    // Run once immediately so the user doesn't wait 60s after start-strategy.
    void this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    const now = Date.now();
    const rl = toRuntimeLike(this.runtime);
    let strategies: Strategy[];
    try {
      strategies = await listActiveStrategies(rl);
    } catch (err) {
      const logger = (this.runtime as { logger?: { warn?: (m: string) => void } }).logger;
      logger?.warn?.(`[strategy-runner] failed to list: ${err}`);
      return;
    }

    for (const s of strategies) {
      const dueAt = (s.lastTickAt ?? 0) + s.schedule.everyMs;
      if (now < dueAt) continue;
      await this.runOne(s, now, rl);
    }
  }

  private async runOne(strategy: Strategy, now: number, rl: AgentRuntimeLike): Promise<void> {
    const impl = getKind(strategy.kind);
    if (!impl) {
      await appendTick(rl, strategy.id, {
        at: now,
        action: "error",
        result: `unknown kind: ${strategy.kind}`,
      });
      await updateStrategy(rl, strategy.id, {
        lastTickAt: now,
        lastError: `unknown kind: ${strategy.kind}`,
      });
      return;
    }

    // Validate params
    const parseResult = impl.paramSchema.safeParse(strategy.params);
    if (!parseResult.success) {
      const msg = parseResult.error.message;
      await appendTick(rl, strategy.id, {
        at: now,
        action: "error",
        result: `invalid params: ${msg}`,
      });
      await updateStrategy(rl, strategy.id, { lastTickAt: now, lastError: msg });
      return;
    }

    try {
      const evalResult = await impl.evaluate(parseResult.data, strategy.vault, this.runtime);
      await appendTick(rl, strategy.id, {
        at: now,
        action: "evaluated",
        result: evalResult.summary,
      });

      if (!evalResult.shouldExecute) {
        await updateStrategy(rl, strategy.id, { lastTickAt: now, lastError: undefined });
        return;
      }

      if (strategy.status === "testing") {
        await appendTick(rl, strategy.id, {
          at: now,
          action: "dry-run",
          result: "would execute (status=testing)",
        });
        await updateStrategy(rl, strategy.id, { lastTickAt: now, lastError: undefined });
        return;
      }

      const execResult = await impl.execute(
        parseResult.data,
        strategy.vault,
        evalResult.context,
        this.runtime,
      );
      await appendTick(rl, strategy.id, {
        at: now,
        action: "executed",
        result:
          execResult.summary +
          (execResult.txHashes?.length ? ` (${execResult.txHashes.length} tx)` : ""),
      });
      await updateStrategy(rl, strategy.id, { lastTickAt: now, lastError: undefined });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await appendTick(rl, strategy.id, { at: now, action: "error", result: msg });
      await updateStrategy(rl, strategy.id, { lastTickAt: now, lastError: msg });
    }
  }
}
