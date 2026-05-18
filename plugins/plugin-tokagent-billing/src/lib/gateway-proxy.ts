/**
 * Typed HTTPS client for the hosted Tokagent gateway (v2.0.0).
 *
 * Every plugin route forwards through one of the methods below. The wire
 * contract is locked in MIGRATION_PLAN.md §3 — any drift between this client
 * and the gateway is a regression.
 *
 * Design notes:
 *   - Auth headers (`Authorization`, `x-api-key`) are passed through as-is.
 *     The CLI does NOT decode tokens or mint API keys locally.
 *   - Streaming (`/v1/messages` SSE) returns the upstream `Response` so the
 *     caller can pipe `Response.body` (a `ReadableStream`) into the agent
 *     framework's response without buffering.
 *   - Errors at the transport layer (DNS, TLS, abort) are surfaced as
 *     `GatewayProxyError` with a `status: 502` so the plugin can render a
 *     consistent shape to clients.
 *   - The base URL is read once at construction. The plugin caller wires it
 *     from `BillingConfig.gatewayUrl` (which falls back to the prod URL).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GatewayProxyOptions {
  baseUrl: string;
  /** Per-request timeout in milliseconds. Default 30s. */
  timeoutMs?: number;
}

/** Headers the proxy will forward as-is when present on the inbound request. */
export interface ForwardHeaders {
  authorization?: string;
  'x-api-key'?: string;
  /** Anthropic-version pin propagated to /v1/messages, /v1/messages/count_tokens. */
  'anthropic-version'?: string;
  /** x402 settle path. */
  'x-payment'?: string;
}

export class GatewayProxyError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GatewayProxyError';
  }
}

/**
 * The shape a forwarder returns to the plugin route. Mirrors what the route
 * needs to relay to the agent framework's `RouteResponse`.
 */
export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  /** JSON-parsed body, or null when the upstream returned no content. */
  body: unknown;
  /** Raw upstream Response — present for streaming endpoints. */
  raw?: Response;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pickForwardHeaders(headers: ForwardHeaders | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers.authorization) out['authorization'] = headers.authorization;
  if (headers['x-api-key']) out['x-api-key'] = headers['x-api-key'];
  if (headers['anthropic-version']) out['anthropic-version'] = headers['anthropic-version'];
  if (headers['x-payment']) out['x-payment'] = headers['x-payment'];
  return out;
}

function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

async function parseJsonSafely(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    const txt = await res.text();
    return txt.length === 0 ? null : txt;
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function collectHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface GatewayClient {
  // §3 endpoints — see MIGRATION_PLAN.md
  health(): Promise<ProxyResponse>;
  billingStatus(): Promise<ProxyResponse>;
  price(): Promise<ProxyResponse>;

  // Auth handshake
  authNoncePost(body: { wallet: string }): Promise<ProxyResponse>;
  authNonceGet(query: { wallet: string; chainId?: number }): Promise<ProxyResponse>;
  authLogin(body: unknown): Promise<ProxyResponse>;

  // API keys
  keysList(headers: ForwardHeaders): Promise<ProxyResponse>;
  keysCreate(headers: ForwardHeaders, body: { name?: string }): Promise<ProxyResponse>;
  keysDelete(headers: ForwardHeaders, id: string): Promise<ProxyResponse>;

  // Credits
  creditsMe(headers: ForwardHeaders): Promise<ProxyResponse>;
  creditsRefresh(headers: ForwardHeaders): Promise<ProxyResponse>;

  // Topup
  topupInfo(headers: ForwardHeaders): Promise<ProxyResponse>;
  topupQuote(headers: ForwardHeaders, body: unknown): Promise<ProxyResponse>;
  topupSettle(headers: ForwardHeaders, body: unknown): Promise<ProxyResponse>;
  topupPreauth(headers: ForwardHeaders, body: unknown): Promise<ProxyResponse>;
  topupStatus(headers: ForwardHeaders): Promise<ProxyResponse>;
  topupRevoke(headers: ForwardHeaders, body?: unknown): Promise<ProxyResponse>;

  // Quote details
  quoteGet(id: string): Promise<ProxyResponse>;

  // Anthropic-compat
  messages(headers: ForwardHeaders, body: unknown): Promise<ProxyResponse>;
  messagesCountTokens(headers: ForwardHeaders, body: unknown): Promise<ProxyResponse>;
  estimate(body: unknown): Promise<ProxyResponse>;
  models(): Promise<ProxyResponse>;

  // Usage / stats
  usageSummary(headers: ForwardHeaders, query?: Record<string, string>): Promise<ProxyResponse>;
  usageCalls(headers: ForwardHeaders, query?: Record<string, string>): Promise<ProxyResponse>;
  usageKeys(headers: ForwardHeaders, query?: Record<string, string>): Promise<ProxyResponse>;
  stats(): Promise<ProxyResponse>;

  // Low-level escape hatch for paths not yet enumerated.
  raw(
    method: string,
    path: string,
    opts?: {
      headers?: ForwardHeaders;
      body?: unknown;
      stream?: boolean;
    },
  ): Promise<ProxyResponse>;
}

export function createGatewayClient(opts: GatewayProxyOptions): GatewayClient {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const timeoutMs = opts.timeoutMs ?? 30_000;

  async function request(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: unknown,
    stream = false,
  ): Promise<ProxyResponse> {
    const url = `${baseUrl}${path}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    const fetchHeaders: Record<string, string> = { ...headers };
    let payload: BodyInit | undefined;
    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
      if (typeof body === 'string') {
        payload = body;
      } else {
        payload = JSON.stringify(body);
        fetchHeaders['content-type'] = fetchHeaders['content-type'] ?? 'application/json';
      }
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: fetchHeaders,
        body: payload,
        signal: ac.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? `Gateway request timed out after ${timeoutMs}ms: ${method} ${path}`
          : `Gateway transport error: ${(err as Error).message}`;
      throw new GatewayProxyError(502, msg, err);
    }
    clearTimeout(timer);

    if (stream) {
      // Streaming caller pipes res.body itself; do not consume here.
      return {
        status: res.status,
        headers: collectHeaders(res),
        body: null,
        raw: res,
      };
    }

    const parsed = await parseJsonSafely(res);
    return {
      status: res.status,
      headers: collectHeaders(res),
      body: parsed,
    };
  }

  return {
    health: () => request('GET', '/healthz', {}, undefined),
    billingStatus: () => request('GET', '/v1/billing/status', {}, undefined),
    price: () => request('GET', '/v1/price', {}, undefined),

    authNoncePost: (body) =>
      request('POST', '/v1/auth/nonce', {}, body),
    authNonceGet: (query) =>
      request('GET', `/v1/auth/nonce${buildQuery(query)}`, {}, undefined),
    authLogin: (body) => request('POST', '/v1/auth/login', {}, body),

    keysList: (headers) =>
      request('GET', '/v1/keys', pickForwardHeaders(headers), undefined),
    keysCreate: (headers, body) =>
      request('POST', '/v1/keys', pickForwardHeaders(headers), body),
    keysDelete: (headers, id) =>
      request('DELETE', `/v1/keys/${encodeURIComponent(id)}`, pickForwardHeaders(headers), undefined),

    creditsMe: (headers) =>
      request('GET', '/v1/credits/me', pickForwardHeaders(headers), undefined),
    creditsRefresh: (headers) =>
      request('POST', '/v1/credits/refresh', pickForwardHeaders(headers), undefined),

    topupInfo: (headers) =>
      request('GET', '/v1/topup/info', pickForwardHeaders(headers), undefined),
    topupQuote: (headers, body) =>
      request('POST', '/v1/topup/quote', pickForwardHeaders(headers), body),
    topupSettle: (headers, body) =>
      request('POST', '/v1/topup/settle', pickForwardHeaders(headers), body),
    topupPreauth: (headers, body) =>
      request('POST', '/v1/topup/preauth', pickForwardHeaders(headers), body),
    topupStatus: (headers) =>
      request('GET', '/v1/topup/status', pickForwardHeaders(headers), undefined),
    topupRevoke: (headers, body) =>
      request('POST', '/v1/topup/revoke', pickForwardHeaders(headers), body),

    quoteGet: (id) =>
      request('GET', `/v1/quote/${encodeURIComponent(id)}`, {}, undefined),

    messages: (headers, body) =>
      request('POST', '/v1/messages', pickForwardHeaders(headers), body, /* stream */ true),
    messagesCountTokens: (headers, body) =>
      request('POST', '/v1/messages/count_tokens', pickForwardHeaders(headers), body),
    estimate: (body) => request('POST', '/v1/estimate', {}, body),
    models: () => request('GET', '/v1/models', {}, undefined),

    usageSummary: (headers, query) =>
      request('GET', `/v1/usage/summary${buildQuery(query)}`, pickForwardHeaders(headers), undefined),
    usageCalls: (headers, query) =>
      request('GET', `/v1/usage/calls${buildQuery(query)}`, pickForwardHeaders(headers), undefined),
    usageKeys: (headers, query) =>
      request('GET', `/v1/usage/keys${buildQuery(query)}`, pickForwardHeaders(headers), undefined),
    stats: () => request('GET', '/v1/stats', {}, undefined),

    raw: (method, path, options = {}) =>
      request(
        method,
        path,
        pickForwardHeaders(options.headers),
        options.body,
        Boolean(options.stream),
      ),
  };
}

// ---------------------------------------------------------------------------
// Process-wide singleton (lazy)
// ---------------------------------------------------------------------------

let _client: GatewayClient | null = null;

/**
 * Get the process-wide gateway client. Reads `TOKAGENT_GATEWAY_URL` and
 * `TOKAGENT_GATEWAY_TIMEOUT_MS` from the environment.
 *
 * Called by every forwarder route. Idempotent — first call constructs, all
 * subsequent calls return the same instance.
 */
export function getGatewayClient(): GatewayClient {
  if (!_client) {
    const baseUrl =
      process.env.TOKAGENT_GATEWAY_URL?.trim() || 'https://gateway.tokagent.ai';
    const rawTimeout = process.env.TOKAGENT_GATEWAY_TIMEOUT_MS?.trim();
    const timeoutMs = rawTimeout && Number.isFinite(Number(rawTimeout)) ? Number(rawTimeout) : 30_000;
    _client = createGatewayClient({ baseUrl, timeoutMs });
  }
  return _client;
}

/** Test / dispose hook — drops the cached client so the next call rebuilds it. */
export function resetGatewayClient(): void {
  _client = null;
}
