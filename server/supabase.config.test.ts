import { describe, it, expect } from "vitest";

/**
 * Database Configuration Tests
 * Aceita MySQL/TiDB (dev Manus) e PostgreSQL/Supabase (produção).
 */
describe("Database Configuration", () => {
  const url = process.env.DATABASE_URL ?? process.env.SUPABASE_URL ?? "";

  it("DATABASE_URL should be a valid database URL when defined", () => {
    if (!url) {
      console.warn("[db.config.test] DATABASE_URL not set — skipping URL format validation");
      return;
    }
    // Aceita MySQL (TiDB dev) ou PostgreSQL (Supabase prod)
    expect(url).toMatch(/^(mysql|postgresql|postgres):\/\//);
  });

  it("DATABASE_URL should contain required parts when defined", () => {
    if (!url) {
      console.warn("[db.config.test] DATABASE_URL not set — skipping URL parts validation");
      return;
    }
    try {
      const parsed = new URL(url);
      const validProtocols = ["mysql:", "postgresql:", "postgres:"];
      expect(validProtocols).toContain(parsed.protocol);
      expect(parsed.hostname.length).toBeGreaterThan(0);
    } catch {
      expect(url).toMatch(/^(mysql|postgresql|postgres):\/\//);
    }
  });
});
