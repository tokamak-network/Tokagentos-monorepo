import type { Provider, ProviderResult } from '@elizaos/core';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import { DEFAULT_HL_API_URL, HL_FETCH_TIMEOUT_MS } from '../types.js';
import type { ClearinghouseState, HyperliquidPosition } from '../types.js';

export const hyperliquidPositionsProvider: Provider = {
  name: 'hyperliquidPositions',
  description: 'Returns open Hyperliquid perpetual positions for the vault\'s HyperCore account.',
  dynamic: true,
  contexts: ['wallet'],

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> => {
    const vaultAddress = runtime.getSetting('TOKAGENT_VAULT_ADDRESS_999');
    if (!vaultAddress) {
      return {
        text: 'No HyperEVM vault configured. Set TOKAGENT_VAULT_ADDRESS_999 to your vault address on chain 999.',
        data: { configured: false },
      };
    }

    const apiUrl = runtime.getSetting('HYPERLIQUID_API_URL') ?? DEFAULT_HL_API_URL;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HL_FETCH_TIMEOUT_MS);

    let state: ClearinghouseState;
    try {
      const resp = await fetch(`${apiUrl}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'clearinghouseState', user: vaultAddress }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`Hyperliquid API returned ${resp.status}`);
      }
      state = (await resp.json()) as ClearinghouseState;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        text: `Hyperliquid API unreachable: ${msg}`,
        data: { error: msg },
      };
    } finally {
      clearTimeout(timeoutId);
    }

    const equity = parseFloat(state.marginSummary.accountValue);
    const positions: HyperliquidPosition[] = (state.assetPositions ?? [])
      .map((ap) => ap.position)
      .filter((p) => parseFloat(p.szi) !== 0);

    const positionLines = positions.map((p) => {
      const side = parseFloat(p.szi) > 0 ? 'LONG' : 'SHORT';
      const size = Math.abs(parseFloat(p.szi));
      const pnl = parseFloat(p.unrealizedPnl);
      return `  ${p.coin} ${side} ${size} @ $${parseFloat(p.entryPx).toFixed(2)}, PnL: $${pnl.toFixed(2)}`;
    });

    const text =
      positions.length === 0
        ? `Hyperliquid: $${equity.toFixed(2)} USD equity, no open positions.`
        : `Hyperliquid: $${equity.toFixed(2)} USD equity across ${positions.length} position${positions.length > 1 ? 's' : ''}.\n${positionLines.join('\n')}`;

    return {
      text,
      data: {
        chainId: 999,
        accountValue: state.marginSummary.accountValue,
        totalMarginUsed: state.marginSummary.totalMarginUsed,
        positions: positions.map((p) => ({
          coin: p.coin,
          szi: p.szi,
          entryPx: p.entryPx,
          unrealizedPnl: p.unrealizedPnl,
          liquidationPx: p.liquidationPx,
        })),
      },
    };
  },
};
