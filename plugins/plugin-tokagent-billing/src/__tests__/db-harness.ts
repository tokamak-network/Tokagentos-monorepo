/**
 * In-memory PGLite harness for plugin-tokagent-billing integration tests.
 *
 * Replicates the pattern from packages/billing but resolves the migrations
 * folder relative to the workspace root (since vitest runs from the plugin's
 * own package directory, not from packages/billing).
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema, type BillingDatabase } from "@tokagentos/billing";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface TestDbHandle {
  db: BillingDatabase;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDbHandle> {
  // Walk up from src/__tests__ → src → plugin root → plugins → workspace root
  const thisFile = fileURLToPath(import.meta.url);
  const workspaceRoot = path.resolve(path.dirname(thisFile), "..", "..", "..", "..");
  const migrationsFolder = path.join(workspaceRoot, "packages", "billing", "drizzle", "migrations");

  const pglite = new PGlite();
  const rawDb = drizzle(pglite, { schema });
  await migrate(rawDb, { migrationsFolder });
  // BillingDatabase is NodePostgresDatabase<Schema>; PgliteDatabase is compatible
  // at runtime. We cast via unknown so TypeScript does not block the test harness.
  const db = rawDb as unknown as BillingDatabase;

  return {
    db,
    close: async () => {
      await pglite.close();
    },
  };
}
