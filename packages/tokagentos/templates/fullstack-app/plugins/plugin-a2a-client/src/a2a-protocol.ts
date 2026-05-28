/**
 * Thin client for Google's A2A (Agent2Agent) protocol.
 *
 * v0.1 covers the two-call happy path most users care about:
 *
 *   1. discoverAgent(baseUrl) → AgentCard
 *      `GET ${baseUrl}/.well-known/agent.json`
 *
 *   2. invokeTask(card, skillId, input) → A2ATask
 *      JSON-RPC POST to card.url, method "tasks/send", with a synthesized
 *      task id and a single user-role message carrying the input as a
 *      data-part.
 *
 * Streaming via SSE (method "tasks/sendSubscribe") and push notifications
 * are deferred to v0.2 — `streamTask` is a stub that throws.
 *
 * Transport: caller supplies a `fetch`-compatible function. We use
 * X402Client.fetch as the transport so paid endpoints transparently
 * trigger the payment loop. This module knows nothing about payments.
 *
 * Spec reference: https://github.com/google-a2a/A2A — see the AgentCard
 * and Task schemas. We intentionally accept a wider set of shapes than
 * the spec mandates (best-effort parsing) so cards from early-adopter
 * agents don't fail discovery on minor schema drift.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentSkill {
  id: string;
  name?: string;
  description?: string;
  /** JSON Schema describing the skill's input. v0.1: we forward without validation. */
  inputSchema?: object;
  /** Optional output schema. */
  outputSchema?: object;
  tags?: string[];
}

export interface AgentCard {
  name: string;
  description?: string;
  /** Base URL where tasks/send is POSTed. */
  url: string;
  version?: string;
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  authentication?: {
    schemes?: string[]; // e.g. ["x402"]
  };
  skills?: AgentSkill[];
  /** Raw card so callers can read fields we don't model. */
  raw?: Record<string, unknown>;
}

export type A2ATaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "canceled"
  | "failed"
  | "unknown";

export interface A2ATextPart {
  type: "text";
  text: string;
}
export interface A2ADataPart {
  type: "data";
  data: unknown;
  mimeType?: string;
}
export interface A2AFilePart {
  type: "file";
  file: { name?: string; mimeType?: string; bytes?: string; uri?: string };
}
export type A2APart = A2ATextPart | A2ADataPart | A2AFilePart;

export interface A2AMessage {
  role: "user" | "agent";
  parts: A2APart[];
}

export interface A2AArtifact {
  name?: string;
  description?: string;
  parts: A2APart[];
  index?: number;
}

export interface A2ATask {
  id: string;
  sessionId?: string;
  status: {
    state: A2ATaskState;
    message?: A2AMessage;
    timestamp?: string;
  };
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class A2AError extends Error {
  constructor(
    message: string,
    public readonly cause:
      | "card-fetch-failed"
      | "card-malformed"
      | "rpc-error"
      | "transport-error"
      | "not-implemented",
    public readonly meta: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "A2AError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface A2ATransport {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

export class A2AClient {
  constructor(private readonly transport: A2ATransport) {}

  /**
   * GET ${baseUrl}/.well-known/agent.json and parse the response.
   *
   * baseUrl may be the agent's base URL (we'll append the well-known path)
   * or a direct URL to an agent.json (we'll use it as-is). We detect the
   * difference by the trailing path component.
   */
  async discoverAgent(baseUrl: string): Promise<AgentCard> {
    const url = baseUrl.endsWith("/agent.json")
      ? baseUrl
      : `${baseUrl.replace(/\/$/, "")}/.well-known/agent.json`;
    let res: Response;
    try {
      res = await this.transport.fetch(url, {
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      throw new A2AError(
        `Failed to fetch AgentCard from ${url}: ${(err as Error).message}`,
        "transport-error",
        { url },
      );
    }
    if (!res.ok) {
      throw new A2AError(
        `AgentCard fetch returned ${res.status} ${res.statusText}`,
        "card-fetch-failed",
        { url, status: res.status, statusText: res.statusText },
      );
    }
    let raw: Record<string, unknown>;
    try {
      raw = (await res.json()) as Record<string, unknown>;
    } catch (err) {
      throw new A2AError(
        `AgentCard response was not valid JSON: ${(err as Error).message}`,
        "card-malformed",
        { url },
      );
    }
    return this.parseCard(raw, url);
  }

  /**
   * Invoke a single skill via JSON-RPC `tasks/send`.
   *
   * Input is wrapped as a data-part in a single user message. Callers
   * that need richer message shapes (multi-part, mixed text+data) can
   * build the message manually and call `invokeRaw` (not exposed in v0.1
   * — extend if needed).
   *
   * Returns the task at whatever state the server returns it in — usually
   * "completed" for synchronous skills, "working" for async ones. Polling
   * for completion isn't built in v0.1; use streamTask once it lands or
   * call `tasks/get` manually via a raw transport call.
   */
  async invokeTask(
    card: AgentCard,
    skillId: string,
    input: unknown,
  ): Promise<A2ATask> {
    const id = crypto.randomUUID();
    const message: A2AMessage = {
      role: "user",
      parts: [
        // Use a data-part for structured input. If the skill expects free
        // text, callers can pass a string and it'll round-trip as the
        // `data` field; the server can introspect.
        typeof input === "string"
          ? { type: "text", text: input }
          : { type: "data", data: input, mimeType: "application/json" },
      ],
    };
    const rpc = {
      jsonrpc: "2.0",
      id,
      method: "tasks/send",
      params: {
        id,
        message,
        // skillId is non-standard at the top level of params, but many
        // implementations accept it via metadata or as a hint. Send both
        // for compatibility.
        metadata: { skillId },
        skillId,
      },
    };
    let res: Response;
    try {
      res = await this.transport.fetch(card.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(rpc),
      });
    } catch (err) {
      throw new A2AError(
        `Task invocation transport error against ${card.url}: ${(err as Error).message}`,
        "transport-error",
        { url: card.url, skillId },
      );
    }
    if (!res.ok) {
      const preview = await safePreview(res);
      throw new A2AError(
        `tasks/send returned ${res.status} ${res.statusText}: ${preview}`,
        "rpc-error",
        { url: card.url, skillId, status: res.status, preview },
      );
    }
    const body = (await res.json()) as {
      jsonrpc?: string;
      result?: A2ATask;
      error?: { code?: number; message?: string; data?: unknown };
    };
    if (body.error) {
      throw new A2AError(
        `tasks/send returned JSON-RPC error: ${body.error.message ?? "(no message)"}`,
        "rpc-error",
        { url: card.url, skillId, error: body.error },
      );
    }
    if (!body.result) {
      throw new A2AError(
        "tasks/send response missing both result and error fields",
        "rpc-error",
        { url: card.url, skillId },
      );
    }
    return body.result;
  }

  /**
   * Streaming variant — not implemented in v0.1. Throws so callers fail
   * cleanly rather than hanging.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, require-yield
  async *streamTask(
    _card: AgentCard,
    _skillId: string,
    _input: unknown,
  ): AsyncIterableIterator<A2ATask> {
    throw new A2AError(
      "streamTask (SSE) is not implemented in v0.1 of plugin-a2a-client",
      "not-implemented",
    );
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private parseCard(raw: Record<string, unknown>, sourceUrl: string): AgentCard {
    const name = String(raw.name ?? "");
    const url = String(raw.url ?? "");
    if (!name || !url) {
      throw new A2AError(
        `AgentCard at ${sourceUrl} missing required fields (name, url)`,
        "card-malformed",
        { name, url },
      );
    }
    return {
      name,
      description:
        typeof raw.description === "string" ? raw.description : undefined,
      url,
      version: typeof raw.version === "string" ? raw.version : undefined,
      capabilities:
        raw.capabilities && typeof raw.capabilities === "object"
          ? (raw.capabilities as AgentCard["capabilities"])
          : undefined,
      authentication:
        raw.authentication && typeof raw.authentication === "object"
          ? (raw.authentication as AgentCard["authentication"])
          : undefined,
      skills: Array.isArray(raw.skills)
        ? (raw.skills as AgentSkill[]).filter((s) => s && typeof s.id === "string")
        : undefined,
      raw,
    };
  }
}

// ---------------------------------------------------------------------------
// Public helpers (used by the action handler to format output)
// ---------------------------------------------------------------------------

/**
 * Best-effort extraction of human-readable output from a task. Used by the
 * CALL_A2A_AGENT action to give the LLM something printable.
 */
export function formatTaskResult(task: A2ATask): string {
  const lines: string[] = [];
  lines.push(`Task ${task.id}: ${task.status.state}`);
  if (task.status.message) {
    const txt = renderMessage(task.status.message);
    if (txt) lines.push(`\n${txt}`);
  }
  if (task.artifacts && task.artifacts.length > 0) {
    lines.push(`\nArtifacts (${task.artifacts.length}):`);
    for (const a of task.artifacts) {
      const headline = a.name ?? a.description ?? "(unnamed)";
      lines.push(`  • ${headline}`);
      for (const p of a.parts) {
        if (p.type === "text") lines.push(`      ${p.text.slice(0, 400)}`);
        else if (p.type === "data") lines.push(`      data: ${JSON.stringify(p.data).slice(0, 400)}`);
        else if (p.type === "file") lines.push(`      file: ${p.file.name ?? "(unnamed)"}`);
      }
    }
  }
  return lines.join("\n");
}

function renderMessage(m: A2AMessage): string {
  const out: string[] = [];
  for (const p of m.parts) {
    if (p.type === "text") out.push(p.text);
    else if (p.type === "data") out.push(`[data] ${JSON.stringify(p.data).slice(0, 400)}`);
    else if (p.type === "file") out.push(`[file] ${p.file.name ?? "(unnamed)"}`);
  }
  return out.join("\n").trim();
}

async function safePreview(res: Response): Promise<string> {
  try {
    const txt = await res.text();
    return txt.length > 200 ? `${txt.slice(0, 200)}…` : txt;
  } catch {
    return "(could not read response body)";
  }
}
