import { describe, it, expect } from "vitest";

describe("Supabase Configuration", () => {
  const url = process.env.DATABASE_URL ?? process.env.SUPABASE_URL ?? "";

  it("DATABASE_URL should be a valid PostgreSQL URL when defined", () => {
    // Em CI/dev, DATABASE_URL pode não estar definida — apenas valida o formato se estiver
    if (!url) {
      console.warn("[supabase.config.test] DATABASE_URL not set — skipping URL format validation");
      return;
    }
    expect(url).toMatch(/^(postgresql|postgres):\/\//);
  });

  it("DATABASE_URL should contain required parts when defined", () => {
    if (!url) {
      console.warn("[supabase.config.test] DATABASE_URL not set — skipping URL parts validation");
      return;
    }
    try {
      const parsed = new URL(url);
      expect(["postgresql:", "postgres:"]).toContain(parsed.protocol);
      // Supabase URLs contêm supabase.co; URLs locais podem ser localhost
      const isSupabase = parsed.hostname.includes("supabase.co");
      const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      expect(isSupabase || isLocal).toBe(true);
    } catch {
      // URL inválida — falha o teste
      expect(url).toMatch(/^(postgresql|postgres):\/\//);
    }
  });
});
