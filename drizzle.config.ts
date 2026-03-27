import { defineConfig } from "drizzle-kit";

const rawUrl = process.env.DATABASE_URL ?? "";
const isMySQL = rawUrl.startsWith("mysql://") || rawUrl.includes("tidbcloud.com");
const connectionString = isMySQL
  ? (process.env.SUPABASE_URL ?? "")
  : rawUrl;

if (!connectionString) {
  throw new Error("No valid database URL found. Set SUPABASE_URL or DATABASE_URL.");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
