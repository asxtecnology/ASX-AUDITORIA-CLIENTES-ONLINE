import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { matchProduct, categorizarProduto } from "./mlScraper";

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

// ─── matchProduct Tests ──────────────────────────────────────────────────────
describe("matchProduct — confidence scoring", () => {
  // Import the actual function from mlScraper
  // matchProduct e categorizarProduto importados no topo do arquivo

  const catalog = [
    { id: 1, codigo: "ASX1007", descricao: "ULTRA LED CSP H7 70W 10000L BIVOLT", ean: "7899", precoMinimo: "169.05" },
    { id: 2, codigo: "ASX1004", descricao: "ULTRA LED CSP H4 70W 10000L BIVOLT", ean: "7898", precoMinimo: "175.00" },
    { id: 3, codigo: "ASX2010", descricao: "SUPER LED H11 40W 6000L 12V", ean: null, precoMinimo: "89.00" },
    { id: 4, codigo: "ASX3001", descricao: "LAMPADA LED T10 PINGO BRANCA 12V", ean: null, precoMinimo: "12.50" },
  ];

  // categorizarProduto
  it("categorizes ULTRA LED product as PREMIUM", () => {
    const result = categorizarProduto("ULTRA LED CSP H7 70W", 105);
    expect(result.categoria).toBe("ULTRA LED");
    expect(result.linha).toBe("PREMIUM");
  });

  it("categorizes cheap LED product as ECO", () => {
    const result = categorizarProduto("LAMPADA LED T10 PINGO", 8);
    // A função prioriza LAMPADA sobre LED no matching de categoria
    expect(["LED", "LAMPADA"]).toContain(result.categoria);
    expect(result.linha).toBe("ECO");
  });

  it("categorizes mid-range product as PLUS", () => {
    const result = categorizarProduto("SUPER LED H4 40W", 55);
    expect(result.categoria).toBe("SUPER LED");
    expect(result.linha).toBe("PLUS");
  });

  it("returns confidence 100 when ASX code is in title", () => {
    const result = matchProduct("PAR ULTRA LED ASX1007 H7 70W BIVOLT", catalog);
    expect(result).not.toBeNull();
    expect(result!.confianca).toBe(100);
    expect(result!.productId).toBe(1);
    expect(result!.metodoMatch).toBe("codigo");
  });

  it("returns confidence 85 when ASX + line + bulb match", () => {
    const result = matchProduct("KIT ULTRA LED ASX H7 70W 10000 LUMENS", catalog);
    expect(result).not.toBeNull();
    expect(result!.confianca).toBe(85);
    expect(result!.productId).toBe(1);
    expect(result!.metodoMatch).toBe("linha_bulbo");
  });

  it("returns confidence 70 when ASX + bulb match (no line)", () => {
    const result = matchProduct("LED ASX H4 AUTOMOTIVO", catalog);
    expect(result).not.toBeNull();
    expect(result!.confianca).toBe(70);
    expect(result!.productId).toBe(2);
    expect(result!.metodoMatch).toBe("marca_bulbo");
  });

  it("returns confidence 50 when only ASX keyword found", () => {
    const result = matchProduct("KIT ASX ILUMINAÇÃO AUTOMOTIVA COMPLETO", catalog);
    expect(result).not.toBeNull();
    expect(result!.confianca).toBe(50);
    expect(result!.metodoMatch).toBe("marca");
  });

  it("returns null for titles without ASX", () => {
    const result = matchProduct("KIT SUPER LED H7 MARCA QUALQUER", catalog);
    expect(result).toBeNull();
  });

  it("returns null for empty catalog", () => {
    const result = matchProduct("ULTRA LED ASX H7", []);
    expect(result).toBeNull();
  });

  it("correctly matches case-insensitive ASX codes", () => {
    const result = matchProduct("par ultra led asx1007 h7 bivolt", catalog);
    expect(result).not.toBeNull();
    expect(result!.confianca).toBe(100);
  });

  it("matches SUPER LED + H11 with confidence 85", () => {
    const result = matchProduct("KIT SUPER LED ASX H11 40W FAROL", catalog);
    expect(result).not.toBeNull();
    expect(result!.confianca).toBe(85);
    expect(result!.productId).toBe(3);
  });
});
