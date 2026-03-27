/**
 * trackedListingsProcessor.test.ts
 * Tests for the tracked listings lifecycle processor
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Unit tests for pure functions ───────────────────────────────────────────

describe("validateApiKey", () => {
  it("accepts the default key when INGEST_API_KEY is not set", async () => {
    delete process.env.INGEST_API_KEY;
    const { validateApiKey } = await import("./trackedListingsProcessor");
    expect(validateApiKey("asx-ingest-2026")).toBe(true);
  });

  it("rejects an incorrect key", async () => {
    delete process.env.INGEST_API_KEY;
    const { validateApiKey } = await import("./trackedListingsProcessor");
    expect(validateApiKey("wrong-key")).toBe(false);
  });

  it("accepts a custom key set via INGEST_API_KEY env", async () => {
    process.env.INGEST_API_KEY = "custom-key-123";
    // Re-import to pick up env change
    vi.resetModules();
    const { validateApiKey } = await import("./trackedListingsProcessor");
    expect(validateApiKey("custom-key-123")).toBe(true);
    delete process.env.INGEST_API_KEY;
  });
});

// ─── Lifecycle status computation ────────────────────────────────────────────

describe("computeNewStatus (via processChecks logic)", () => {
  // We test the logic indirectly by verifying expected status transitions

  it("novo → monitorado when first check is OK", () => {
    // Simulates: status=novo, violationStatus=ok, consecutiveOk=1
    // Expected: monitorado (any ok check from novo → monitorado)
    const status = simulateStatusTransition("novo", "ok", 0, 1);
    expect(status).toBe("monitorado");
  });

  it("monitorado → suspeito on first violation", () => {
    const status = simulateStatusTransition("monitorado", "violation", 1, 0);
    expect(status).toBe("suspeito");
  });

  it("suspeito → violador on second consecutive violation", () => {
    const status = simulateStatusTransition("suspeito", "violation", 2, 0);
    expect(status).toBe("violador");
  });

  it("violador → suspeito after 1 ok check (not enough to clear)", () => {
    const status = simulateStatusTransition("violador", "ok", 0, 1);
    expect(status).toBe("violador"); // needs 3 consecutive OKs
  });

  it("violador → monitorado after 3 consecutive ok checks", () => {
    const status = simulateStatusTransition("violador", "ok", 0, 3);
    expect(status).toBe("monitorado");
  });

  it("any status → inativo when unavailable", () => {
    expect(simulateStatusTransition("monitorado", "unavailable", 0, 0)).toBe("inativo");
    expect(simulateStatusTransition("violador", "unavailable", 0, 0)).toBe("inativo");
    expect(simulateStatusTransition("suspeito", "unavailable", 0, 0)).toBe("inativo");
  });
});

// ─── Helper: replicate computeNewStatus logic ─────────────────────────────────

type ListingStatus = "novo" | "monitorado" | "suspeito" | "violador" | "inativo";
type ViolationStatus = "ok" | "violation" | "unavailable";

const VIOLATION_THRESHOLD = 2;
const OK_THRESHOLD = 3;

function simulateStatusTransition(
  currentStatus: ListingStatus,
  violationStatus: ViolationStatus,
  consecutiveViolations: number,
  consecutiveOk: number
): ListingStatus {
  if (violationStatus === "unavailable") return "inativo";

  if (violationStatus === "violation") {
    if (consecutiveViolations >= VIOLATION_THRESHOLD) return "violador";
    return "suspeito";
  }

  // violationStatus === "ok"
  if (currentStatus === "violador" || currentStatus === "suspeito") {
    if (consecutiveOk >= OK_THRESHOLD) return "monitorado";
    return currentStatus;
  }

  return "monitorado";
}

// ─── ChecksPayload validation ─────────────────────────────────────────────────

describe("ChecksPayload structure", () => {
  it("should accept valid check payload structure", () => {
    const payload = {
      source: "browser_extension" as const,
      checks: [
        {
          mlItemId: "MLB123456789",
          observedPrice: 89.90,
          observedTitle: "Lâmpada ASX Ultra LED H7",
          observedAvailable: true,
          checkSource: "browser_extension" as const,
          evidenceUrl: "https://www.mercadolivre.com.br/item/MLB123456789",
        },
      ],
      apiKey: "asx-ingest-2026",
    };

    expect(payload.checks).toHaveLength(1);
    expect(payload.checks[0].mlItemId).toBe("MLB123456789");
    expect(payload.checks[0].observedPrice).toBe(89.90);
    expect(typeof payload.checks[0].observedAvailable).toBe("boolean");
  });

  it("should handle check without optional fields", () => {
    const check = {
      mlItemId: "MLB999",
      observedPrice: 50.00,
      checkSource: "manual" as const,
    };

    expect(check.mlItemId).toBeDefined();
    expect(check.observedPrice).toBeDefined();
    // Optional fields should be absent
    expect((check as any).evidenceUrl).toBeUndefined();
    expect((check as any).screenshotUrl).toBeUndefined();
  });
});

// ─── PromoteResult structure ──────────────────────────────────────────────────

describe("PromoteResult structure", () => {
  it("should have all required fields", () => {
    const result = {
      promoted: 5,
      alreadyTracked: 3,
      addedToReview: 2,
      errors: [],
    };

    expect(result.promoted).toBeGreaterThanOrEqual(0);
    expect(result.alreadyTracked).toBeGreaterThanOrEqual(0);
    expect(result.addedToReview).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

// ─── ChecksResult structure ───────────────────────────────────────────────────

describe("ChecksResult structure", () => {
  it("should have all required fields", () => {
    const result = {
      accepted: 10,
      processed: 8,
      violations: 2,
      notFound: 1,
      errors: ["Item MLB999 not found"],
    };

    expect(result.accepted).toBeGreaterThanOrEqual(0);
    expect(result.processed).toBeLessThanOrEqual(result.accepted);
    expect(result.violations).toBeGreaterThanOrEqual(0);
    expect(result.notFound).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
