import type { Provider, ProviderResult } from '@tokagentos/core';
import type { IAgentRuntime, Memory, State } from '@tokagentos/core';
import { DEFAULT_DATA_URL, PM_FETCH_TIMEOUT_MS } from '../types.js';
import type { PolymarketPosition } from '../types.js';

export const polymarketPositionsProvider: Provider = {
  name: 'polymarketPositions',
  description: 'Returns open Polymarket prediction market positions for the vault on Polygon.',
  dynamic: true,
  contexts: ['wallet'],

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> => {
    const vaultAddress = runtime.getSetting('TOKAGENT_VAULT_ADDRESS_137');
    if (!vaultAddress) {
      return {
        text: 'No Polygon vault configured. Set TOKAGENT_VAULT_ADDRESS_137 to enable Polymarket position tracking.',
        data: { configured: false },
      };
    }

    const dataUrl = runtime.getSetting('POLYMARKET_DATA_URL') ?? DEFAULT_DATA_URL;
    const url = `${dataUrl}/positions?user=${vaultAddress}&sizeThreshold=0.01`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PM_FETCH_TIMEOUT_MS);

    let positions: PolymarketPosition[];
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`Polymarket data API returned ${resp.status}`);
      }
      positions = (await resp.json()) as PolymarketPosition[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        text: `Polymarket API unreachable: ${msg}`,
        data: { error: msg },
      };
    } finally {
      clearTimeout(timeoutId);
    }

    if (!Array.isArray(positions) || positions.length === 0) {
      return {
        text: 'Vault has no open Polymarket positions.',
        data: { positions: [] },
      };
    }

    const totalNotional = positions.reduce((sum, p) => sum + p.size * p.currentPrice, 0);
    const positionLines = positions.map((p) => {
      const notional = (p.size * p.currentPrice).toFixed(2);
      return `  "${p.title}" → ${p.outcome}: ${(p.currentPrice * 100).toFixed(1)}% ($${notional})`;
    });

    const text = [
      `Polymarket: ${positions.length} open position${positions.length > 1 ? 's' : ''} totaling $${totalNotional.toFixed(2)} notional.`,
      ...positionLines,
    ].join('\n');

    return {
      text,
      data: {
        chainId: 137,
        totalNotional,
        positions: positions.map((p) => ({
          conditionId: p.conditionId,
          outcome: p.outcome,
          size: p.size,
          avgPrice: p.avgPrice,
          currentPrice: p.currentPrice,
          title: p.title,
          slug: p.slug,
        })),
      },
    };
  },
};
