import type { Config } from "drizzle-kit";

export default {
  schema: "./src/ledger/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  casing: "snake_case",
} satisfies Config;
