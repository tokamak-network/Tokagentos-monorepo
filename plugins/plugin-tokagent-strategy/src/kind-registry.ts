import type { StrategyKind, StrategyKindImpl } from "./types.js";

const registry = new Map<StrategyKind, StrategyKindImpl>();

/** Register a strategy kind implementation. Must be called at plugin init time. */
export function registerKind(impl: StrategyKindImpl): void {
  registry.set(impl.kind, impl);
}

/** Retrieve a kind implementation. Returns undefined if not registered. */
export function getKind(kind: StrategyKind): StrategyKindImpl | undefined {
  return registry.get(kind);
}

/** List all registered strategy kinds. */
export function listKinds(): StrategyKind[] {
  return Array.from(registry.keys());
}
