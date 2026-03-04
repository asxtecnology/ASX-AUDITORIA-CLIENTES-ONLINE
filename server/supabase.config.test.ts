import { describe, it, expect } from "vitest";

describe("Supabase Configuration", () => {
  it("SUPABASE_URL should be set and valid", () => {
    const url = process.env.SUPABASE_URL;
    expect(url).toBeDefined();
    expect(url).toMatch(/^postgresql:\/\//);
    expect(url).toContain("supabase.co");
  });

  it("SUPABASE_URL should contain required parts", () => {
    const url = process.env.SUPABASE_URL ?? "";
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("postgresql:");
    expect(parsed.hostname).toContain("supabase.co");
    expect(parsed.port).toBe("5432");
    expect(parsed.pathname).toBe("/postgres");
  });
});
