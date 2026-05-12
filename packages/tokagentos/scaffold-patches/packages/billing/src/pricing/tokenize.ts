/**
 * Token estimation heuristics for billing preflight.
 *
 * TODO(billing-tokenize): swap for a real tokenizer (tiktoken or claude tokenizer SDK) once provided.
 */

/**
 * Conservative token estimate for a single text. Latin alphabets compress
 * ~3.5 chars/token, but CJK/emoji often hit ~1 char per 1–2 tokens; treating
 * non-ASCII code points as 2 tokens each keeps the estimate above the real
 * Claude tokenizer count for Korean/Japanese/Chinese prompts (where the old
 * chars/3.5 heuristic under-counted by ~7×, leaving the operator on the hook
 * for the difference).
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  let ascii = 0;
  let nonAscii = 0;
  for (const c of text) {
    if (c.charCodeAt(0) < 128) ascii++;
    else nonAscii++;
  }
  return Math.ceil(ascii / 3.5 + nonAscii * 2);
}

/**
 * Conservative token cost for a single Anthropic content block.
 * Handles `text`, `image`, `tool_use`, `tool_result`, `document`, and
 * `thinking`. Unknown block shapes are JSON-serialised as a fallback so
 * we never silently undercount.
 */
function estimateBlockTokens(block: unknown): number {
  if (typeof block === "string") return estimateTextTokens(block);
  if (typeof block !== "object" || block === null) return 0;
  const b = block as Record<string, unknown>;
  const type = typeof b.type === "string" ? b.type : "";
  if (type === "text") {
    return estimateTextTokens(typeof b.text === "string" ? b.text : "");
  }
  if (type === "image") {
    // No image dimensions on the wire here; 1500 is a comfortable upper
    // bound for the typical Anthropic image-token cost (~85–1600 tokens
    // depending on resolution).
    return 1500;
  }
  if (type === "tool_use") {
    let n = 32;
    if (typeof b.name === "string") n += estimateTextTokens(b.name);
    try {
      n += estimateTextTokens(JSON.stringify(b.input ?? {}));
    } catch {
      n += 200;
    }
    return n;
  }
  if (type === "tool_result") {
    const c = b.content;
    if (typeof c === "string") return estimateTextTokens(c) + 16;
    if (Array.isArray(c)) {
      let n = 16;
      for (const inner of c) n += estimateBlockTokens(inner);
      return n;
    }
    return 16;
  }
  if (type === "document") {
    // Without page count or byte size, assume a non-trivial PDF/text doc.
    return 4000;
  }
  if (type === "thinking") {
    return estimateTextTokens(typeof b.thinking === "string" ? b.thinking : "");
  }
  try {
    return estimateTextTokens(JSON.stringify(b));
  } catch {
    return 100;
  }
}

/** Sum tokens across an Anthropic message `content` value (string OR array). */
function estimateContentTokens(content: unknown): number {
  if (typeof content === "string") return estimateTextTokens(content);
  if (Array.isArray(content)) {
    let n = 0;
    for (const block of content) n += estimateBlockTokens(block);
    return n;
  }
  return 0;
}

/**
 * Upper-bound token count for a request. Counts:
 *   - the top-level `system` (string OR content blocks) when present
 *   - role + content + a small per-message envelope for every message
 *     (content may be a string OR an array of Anthropic content blocks)
 *   - the JSON-serialised tool definitions (large schemas inflate the prompt)
 *
 * The `system` parameter accepts Anthropic's top-level shape; OpenAI-style
 * system-as-message entries should be lifted by the caller before invoking
 * this function.
 */
export function estimateInputTokens(
  messages: Array<{ role: string; content: unknown }>,
  tools?: unknown[],
  system?: unknown,
): number {
  let total = 0;
  if (system !== undefined && system !== null) {
    const s = estimateContentTokens(system);
    if (s > 0) total += s + 4;
  }
  for (const m of messages) {
    total += estimateTextTokens(m.role) + estimateContentTokens(m.content) + 4;
  }
  if (tools && tools.length > 0) {
    let toolTokens = 50; // Claude's auto tool-use preamble
    for (const t of tools) toolTokens += tokensForTool(t);
    total += toolTokens;
  }
  return total;
}

// Per-call agents resend an identical tools array on every request — caching
// the token cost by reference identity skips the JSON.stringify of large
// schemas (often >50 KB combined) on the hot path.
const toolTokenCache = new WeakMap<object, number>();

function tokensForTool(t: unknown): number {
  if (typeof t === "object" && t !== null) {
    const cached = toolTokenCache.get(t as object);
    if (cached !== undefined) return cached;
    let n: number;
    try {
      n = estimateTextTokens(JSON.stringify(t));
    } catch {
      n = 200;
    }
    toolTokenCache.set(t as object, n);
    return n;
  }
  try {
    return estimateTextTokens(JSON.stringify(t));
  } catch {
    return 200;
  }
}
