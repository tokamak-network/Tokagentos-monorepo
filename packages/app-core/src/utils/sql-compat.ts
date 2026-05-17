import type { AgentRuntime } from "@tokagentos/core";

const repairedRuntimes = new WeakSet<AgentRuntime>();
const repairPromises = new WeakMap<AgentRuntime, Promise<void>>();

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function sanitizeIdentifier(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_]/g, "");
  if (sanitized.length === 0 || sanitized.length > 128) return null;
  return sanitized;
}

export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function executeRawSql(
  runtime: AgentRuntime,
  sqlText: string,
): Promise<{
  rows: Record<string, unknown>[];
  columns: string[];
}> {
  const db = runtime.adapter?.db as
    | {
        execute: (query: { queryChunks: unknown[] }) => Promise<{
          rows: Record<string, unknown>[];
          fields?: Array<{ name: string }>;
        }>;
      }
    | undefined;

  if (!db?.execute) {
    throw new Error("Database adapter not available");
  }

  const { sql } = await import("drizzle-orm");
  const result = await db.execute(sql.raw(sqlText));
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const columns = Array.isArray(result.fields)
    ? result.fields.map((field) => field.name)
    : Object.keys(rows[0] ?? {});

  return { rows, columns };
}

async function getTableColumnNames(
  runtime: AgentRuntime,
  tableName: string,
  schemaName = "public",
): Promise<Set<string>> {
  const columns = new Set<string>();

  try {
    const { rows } = await executeRawSql(
      runtime,
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = ${sqlLiteral(schemaName)}
          AND table_name = ${sqlLiteral(tableName)}
        ORDER BY ordinal_position`,
    );

    for (const row of rows) {
      const value = row.column_name;
      if (typeof value === "string" && value.length > 0) {
        columns.add(value);
      }
    }
  } catch {
    // Fall through to PRAGMA for PGlite/SQLite compatibility.
  }

  if (columns.size > 0) {
    return columns;
  }

  try {
    const safeTableName = sanitizeIdentifier(tableName);
    if (!safeTableName) {
      return columns;
    }

    const { rows } = await executeRawSql(
      runtime,
      `PRAGMA table_info(${safeTableName})`,
    );

    for (const row of rows) {
      const value = row.name;
      if (typeof value === "string" && value.length > 0) {
        columns.add(value);
      }
    }
  } catch {
    // Ignore missing-table/missing-pragma support.
  }

  return columns;
}

const skippedMissingTables = new Set<string>();

async function addColumnIfMissing(
  runtime: AgentRuntime,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  const columns = await getTableColumnNames(runtime, tableName);
  if (columns.has(columnName)) {
    return;
  }

  // Missing-table detection: getTableColumnNames returns an empty set when
  // the table doesn't exist (information_schema.columns returns 0 rows for
  // unknown tables — no error thrown). When that happens, treat the table
  // as "feature not deployed" rather than a critical schema gap. This
  // matches the existing runtime behavior — e.g. tokagent logs
  //   "trajectories service unavailable; trajectory capture disabled"
  // when the trajectories service isn't registered. Forcing a CREATE TABLE
  // here would commit to a base schema we don't own; better to let the
  // owning service create its own table on demand.
  if (columns.size === 0) {
    if (!skippedMissingTables.has(tableName)) {
      skippedMissingTables.add(tableName);
      // Use console.warn rather than the runtime logger to keep this module
      // dependency-free (it's imported during boot before the logger may be
      // wired up).
      console.warn(
        `[sql-compat] Table ${quoteIdent(tableName)} does not exist; ` +
          `skipping schema compatibility checks for it. ` +
          `If you need this feature, ensure the owning service creates ` +
          `the table during its init.`,
      );
    }
    return;
  }

  // Self-heal: do what the function name (and the parent
  // `ensureRuntimeSqlCompatibility` / `repairRuntimeAfterBoot`) promise.
  //
  // The function was imported from upstream elizaOS v2.0.0-alpha.223 as a
  // pure assert that delegated migration to the operator. Tokagentos doesn't
  // ship those migration files for `@elizaos/plugin-sql@1.7.2` (the only
  // installable version), so the assert reliably crashes boot before the
  // HTTP server can start. We complete the function's intent by running an
  // additive `ALTER TABLE ... ADD COLUMN` here.
  //
  // Safety:
  //   - sanitizeIdentifier rejects anything outside [A-Za-z0-9_] and caps at
  //     128 chars, blocking SQL injection via tableName/columnName.
  //   - We've already confirmed the column is absent via the columns set
  //     above, so plain `ADD COLUMN` (no IF NOT EXISTS) is portable across
  //     Postgres, PGlite, and SQLite without dialect branching.
  //   - The parent function holds a per-runtime mutex (`repairPromises`),
  //     so concurrent boot paths can't race here.
  //   - definition is hardcoded at the call sites (lines 144-162) — never
  //     user-supplied — so embedding it directly in the SQL is safe.
  //
  // See: docs/eng-tickets/2026-05-16-tokagentos-boot-vs-plugin-sql-version-skew.md
  const safeTable = sanitizeIdentifier(tableName);
  const safeColumn = sanitizeIdentifier(columnName);
  if (!safeTable || !safeColumn) {
    throw new Error(
      `[sql-compat] Cannot add column ${quoteIdent(tableName)}.${quoteIdent(columnName)}: invalid identifier`,
    );
  }

  try {
    await executeRawSql(
      runtime,
      `ALTER TABLE ${quoteIdent(safeTable)} ADD COLUMN ${quoteIdent(safeColumn)} ${definition}`,
    );
  } catch (err) {
    throw new Error(
      `[sql-compat] Failed to add column ${quoteIdent(tableName)}.${quoteIdent(columnName)} (${definition}): ${(err as Error).message}`,
    );
  }
}

export async function ensureRuntimeSqlCompatibility(
  runtime: AgentRuntime | null | undefined,
): Promise<void> {
  if (!runtime?.adapter?.db) {
    return;
  }

  if (repairedRuntimes.has(runtime)) {
    return;
  }

  const existingRepair = repairPromises.get(runtime);
  if (existingRepair) {
    await existingRepair;
    return;
  }

  const repairPromise = (async () => {
    await addColumnIfMissing(
      runtime,
      "participants",
      "agent_id",
      'uuid REFERENCES "agents"("id") ON DELETE CASCADE',
    );
    await addColumnIfMissing(runtime, "participants", "room_state", "text");

    for (const [columnName, definition] of [
      ["step_count", "integer NOT NULL DEFAULT 0"],
      ["llm_call_count", "integer NOT NULL DEFAULT 0"],
      ["total_prompt_tokens", "integer NOT NULL DEFAULT 0"],
      ["total_completion_tokens", "integer NOT NULL DEFAULT 0"],
      ["total_reward", "real NOT NULL DEFAULT 0"],
      ["scenario_id", "text"],
      ["batch_id", "text"],
    ] as const) {
      await addColumnIfMissing(runtime, "trajectories", columnName, definition);
    }

    repairedRuntimes.add(runtime);
  })().finally(() => {
    repairPromises.delete(runtime);
  });

  repairPromises.set(runtime, repairPromise);
  await repairPromise;
}
