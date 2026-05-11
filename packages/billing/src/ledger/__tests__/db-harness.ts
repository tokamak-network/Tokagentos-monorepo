/**
 * PGLite test harness for @tokagentos/billing database tests (Decision D14).
 *
 * PGLite is a pure WASM Postgres that runs in any Node/Bun environment without
 * network access or external process. Tests ALWAYS run — no env flag needed.
 *
 * The `migrationsFolder` path is resolved relative to the package root
 * (`packages/billing/`) where `bun run test` / `vitest` is invoked.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema, type Schema } from "../schema.js";

export type TestDb = PgliteDatabase<Schema>;

export interface TestDbHandle {
  db: TestDb;
  close: () => Promise<void>;
}

/**
 * Create an in-memory PGLite database, run all migrations, and return the
 * Drizzle instance plus a close handle.
 *
 * Call `close()` in `afterAll` / `afterEach` to release WASM resources.
 */
export async function createTestDb(): Promise<TestDbHandle> {
  const pglite = new PGlite(); // in-memory, no dataDir
  const db = drizzle(pglite, { schema }) as TestDb;

  await migrate(db, { migrationsFolder: "./drizzle/migrations" });

  return {
    db,
    close: async () => {
      await pglite.close();
    },
  };
}
