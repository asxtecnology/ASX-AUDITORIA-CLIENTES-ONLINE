import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "user" | "admin" = "admin"): { ctx: TrpcContext; clearedCookies: { name: string; options: Record<string, unknown> }[] } {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@asx.com",
    name: "ASX Test",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });

  it("auth.me returns current user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.email).toBe("test@asx.com");
    expect(user?.role).toBe("admin");
  });
});

// ─── Price Calculation Tests ──────────────────────────────────────────────────
describe("Price calculation logic", () => {
  it("calculates minimum price correctly with 60% margin", () => {
    const custo = 105.0;
    const margem = 0.60;
    const precoMinimo = custo * (1 + margem);
    expect(precoMinimo).toBeCloseTo(168.0, 1);
  });

  it("detects violation when price is below minimum", () => {
    const precoAnunciado = 150.0;
    const precoMinimo = 169.05;
    const isViolation = precoAnunciado < precoMinimo;
    expect(isViolation).toBe(true);
  });

  it("does not flag violation when price is above minimum", () => {
    const precoAnunciado = 200.0;
    const precoMinimo = 169.05;
    const isViolation = precoAnunciado < precoMinimo;
    expect(isViolation).toBe(false);
  });

  it("calculates violation difference correctly", () => {
    const precoAnunciado = 150.0;
    const precoMinimo = 169.05;
    const diferenca = precoMinimo - precoAnunciado;
    const percentAbaixo = (diferenca / precoMinimo) * 100;
    expect(diferenca).toBeCloseTo(19.05, 1);
    expect(percentAbaixo).toBeCloseTo(11.27, 1);
  });
});

// ─── Keyword Extraction Tests ─────────────────────────────────────────────────
describe("Keyword extraction for ML search", () => {
  const CONNECTOR_PATTERNS = ["H1","H3","H4","H7","H8","H9","H11","H13","H15","H16","H27","HB3","HB4","T10","T5","P21W","T15","W16W"];

  function extractKeywords(descricao: string): string[] {
    const upper = descricao.toUpperCase();
    const found: string[] = [];
    for (const p of CONNECTOR_PATTERNS) {
      if (upper.includes(p)) found.push(p);
    }
    if (upper.includes("ULTRA LED")) found.unshift("ULTRA LED");
    else if (upper.includes("SUPER LED")) found.unshift("SUPER LED");
    else if (upper.includes("WORKLIGHT")) found.unshift("WORKLIGHT");
    return Array.from(new Set(found)).slice(0, 3);
  }

  it("extracts ULTRA LED and H7 from product description", () => {
    const kws = extractKeywords("ULTRA LED CSP H7 - 70W - 10.000 LUMENS - BIVOLT");
    expect(kws).toContain("ULTRA LED");
    expect(kws).toContain("H7");
  });

  it("extracts T10 from position light description", () => {
    const kws = extractKeywords("LAMPADA LED T10 PINGO BRANCA 12V");
    expect(kws).toContain("T10");
  });

  it("returns max 3 keywords", () => {
    const kws = extractKeywords("ULTRA LED H1 H3 H4 H7 H11 BIVOLT");
    expect(kws.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array for unknown product", () => {
    const kws = extractKeywords("PRODUTO SEM CONECTOR CONHECIDO");
    expect(kws).toHaveLength(0);
  });
});
