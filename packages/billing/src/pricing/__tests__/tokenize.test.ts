import { describe, it, expect } from 'vitest';
import { estimateTextTokens, estimateInputTokens } from '../tokenize.js';

// Source: "estimateInputTokens accepts Anthropic content blocks (text + image + tool_use)"
describe('estimateInputTokens — content blocks', () => {
  it('handles text + image + tool_use blocks', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this image' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: '...' } },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'search', input: { q: 'octopus' } }],
      },
    ];
    const tokens = estimateInputTokens(messages, undefined, undefined);
    // Image alone contributes a 1500-token floor; total must comfortably exceed it.
    expect(tokens).toBeGreaterThan(1500);
  });

  // Source: "estimateInputTokens counts top-level system on top of messages"
  it('counts top-level system on top of messages', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    const without = estimateInputTokens(messages, undefined, undefined);
    const withSystem = estimateInputTokens(
      messages,
      undefined,
      'you are a careful and meticulous coding assistant',
    );
    expect(withSystem).toBeGreaterThan(without);
  });

  // Source: "estimateInputTokens treats string content the same as before"
  it('handles plain string content', () => {
    const tokens = estimateInputTokens(
      [{ role: 'user', content: 'hello world' }],
      undefined,
      undefined,
    );
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('estimateInputTokens — tool schemas', () => {
  it('adds tokens for tool definitions', () => {
    const messages = [{ role: 'user', content: 'hi' }];
    const withoutTools = estimateInputTokens(messages, [], undefined);
    const withTools = estimateInputTokens(
      messages,
      [{ name: 'get_weather', description: 'Get weather for a location', input_schema: { type: 'object', properties: { location: { type: 'string' } } } }],
      undefined,
    );
    expect(withTools).toBeGreaterThan(withoutTools);
  });

  it('caches tool token cost by reference identity (WeakMap)', () => {
    const tool = { name: 'my_tool', description: 'A tool', input_schema: { type: 'object', properties: {} } };
    const messages = [{ role: 'user', content: 'hi' }];
    // Same reference both times — should hit the cache on the second call
    const first = estimateInputTokens(messages, [tool], undefined);
    const second = estimateInputTokens(messages, [tool], undefined);
    expect(first).toBe(second);
  });
});

describe('estimateTextTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTextTokens('')).toBe(0);
  });

  it('estimates ASCII text at roughly 1 token per 3.5 chars', () => {
    const text = 'The quick brown fox jumps over the lazy dog'; // 43 chars ASCII
    const expected = Math.ceil(43 / 3.5);
    expect(estimateTextTokens(text)).toBe(expected);
  });

  it('weights non-ASCII characters at 2 tokens each', () => {
    // 1 non-ASCII char → 2 tokens (ceil(0/3.5 + 1*2) = 2)
    expect(estimateTextTokens('안')).toBe(2);
  });

  it('handles mixed ASCII and non-ASCII', () => {
    // "hi안" → 2 ASCII + 1 non-ASCII → ceil(2/3.5 + 2) = ceil(0.571 + 2) = 3
    expect(estimateTextTokens('hi안')).toBe(3);
  });
});

describe('estimateInputTokens — edge cases', () => {
  it('handles tool_result with string content', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool_1', content: 'The result is 42.' },
        ],
      },
    ];
    const tokens = estimateInputTokens(messages, undefined, undefined);
    expect(tokens).toBeGreaterThan(0);
  });

  it('handles thinking blocks', () => {
    const messages = [
      {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Let me reason step by step...' }],
      },
    ];
    const tokens = estimateInputTokens(messages, undefined, undefined);
    expect(tokens).toBeGreaterThan(0);
  });

  it('handles document blocks with a fixed 4000-token estimate', () => {
    const messages = [
      {
        role: 'user',
        content: [{ type: 'document', source: { type: 'base64', data: 'abc' } }],
      },
    ];
    const tokens = estimateInputTokens(messages, undefined, undefined);
    // 4000 for document + role + 4 envelope
    expect(tokens).toBeGreaterThanOrEqual(4000);
  });
});
