import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  deleteAlertConfig,
  getActiveProducts,
  getAlertConfigs,
  getAllSettings,
  getLatestMonitoringRun,
  getMonitoringRuns,
  getProductByCodigo,
  getProductById,
  getProducts,
  getViolationStats,
  getViolationTrend,
  getViolations,
  initDefaultSettings,
  toggleProductActive,
  updateProduct,
  updateViolationStatus,
  upsertAlertConfig,
  upsertProduct,
  upsertSetting,
  getSnapshotsByProduct,
  // v2 helpers
  getClientes,
  getClienteById,
  upsertCliente,
  deleteCliente,
  getVendedores,
  getViolationsByCliente,
  getHistoricoPrecos,
} from "./db";
import { runScraper, runMonitoring } from "./mlScraper";

// ─── Products Router ──────────────────────────────────────────────────────────
const productsRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      ativo: z.boolean().optional(),
      categoria: z.string().optional(),
      linha: z.enum(["PREMIUM", "PLUS", "ECO"]).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(({ input }) => getProducts(input)),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getProductById(input.id)),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      descricao: z.string().optional(),
      precoCusto: z.string().optional(),
      precoMinimo: z.string().optional(),
      margemPercent: z.string().optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return updateProduct(id, data);
    }),

  toggleActive: protectedProcedure
    .input(z.object({ id: z.number(), ativo: z.boolean() }))
    .mutation(({ input }) => toggleProductActive(input.id, input.ativo)),

  import: protectedProcedure
    .input(z.array(z.object({
      codigo: z.string(),
      descricao: z.string(),
      ean: z.string().optional(),
      unidade: z.string().optional(),
      caixa: z.number().optional(),
      voltagem: z.string().optional(),
      ncm: z.string().optional(),
      precoCusto: z.string(),
      precoMinimo: z.string(),
      margemPercent: z.string().optional(),
      statusBase: z.string().optional(),
    })))
    .mutation(async ({ input }) => {
      let imported = 0;
      let skipped = 0;
      for (const p of input) {
        try {
          await upsertProduct({
            ...p,
            caixa: p.caixa ?? null,
            margemPercent: p.margemPercent ?? "60.00",
            statusBase: p.statusBase ?? "ATIVO",
          });
          imported++;
        } catch {
          skipped++;
        }
      }
      return { imported, skipped };
    }),

  priceHistory: protectedProcedure
    .input(z.object({ productId: z.number(), days: z.number().default(30) }))
    .query(({ input }) => getSnapshotsByProduct(input.productId, input.days)),
});

// ─── Monitoring Router ────────────────────────────────────────────────────────
const monitoringRouter = router({
  runNow: protectedProcedure
    .input(z.object({ clienteId: z.number().optional() }).optional())
    .mutation(({ input }) => runScraper({ triggeredBy: "manual", clienteId: input?.clienteId })),

  history: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(({ input }) => getMonitoringRuns(input.limit)),

  latest: protectedProcedure
    .query(async () => {
      const run = await getLatestMonitoringRun();
      // tRPC cannot return undefined — return null-safe default when no run exists
      return run ?? null;
    }),

  stats: protectedProcedure
    .query(() => getViolationStats()),

  trend: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(({ input }) => getViolationTrend(input.days)),
});

// ─── Violations Router ────────────────────────────────────────────────────────
const violationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["open", "notified", "resolved"]).optional(),
      productId: z.number().optional(),
      sellerId: z.string().optional(),
      clienteId: z.number().optional(),
      categoria: z.string().optional(),
      confiancaMin: z.number().optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(({ input }) => getViolations(input)),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["open", "notified", "resolved"]) }))
    .mutation(({ input }) => updateViolationStatus(input.id, input.status)),

  byCliente: protectedProcedure
    .input(z.object({ clienteId: z.number(), limit: z.number().default(20) }))
    .query(({ input }) => getViolationsByCliente(input.clienteId, input.limit)),
});

// ─── Clientes Router ──────────────────────────────────────────────────────────
const clientesRouter = router({
  list: protectedProcedure
    .query(() => getClientes()),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getClienteById(input.id)),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      nome: z.string().min(1),
      sellerId: z.string().min(1),
      lojaML: z.string().optional(),
      linkLoja: z.string().optional(),
      status: z.enum(["ativo", "inativo"]).default("ativo"),
    }))
    .mutation(({ input }) => upsertCliente(input)),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteCliente(input.id)),

  runCheck: protectedProcedure
    .input(z.object({ clienteId: z.number() }))
    .mutation(({ input }) => runScraper({ triggeredBy: "manual", clienteId: input.clienteId })),
});

// ─── Vendedores Router ────────────────────────────────────────────────────────
const vendedoresRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
      orderBy: z.enum(["total_violacoes", "total_anuncios"]).default("total_violacoes"),
    }))
    .query(({ input }) => getVendedores(input)),

  historico: protectedProcedure
    .input(z.object({
      codigoAsx: z.string().optional(),
      vendedor: z.string().optional(),
      days: z.number().default(30),
    }))
    .query(({ input }) => getHistoricoPrecos(input)),
});

// ─── Alerts Router ────────────────────────────────────────────────────────────
const alertsRouter = router({
  list: protectedProcedure.query(() => getAlertConfigs()),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      email: z.string().email(),
      name: z.string().optional(),
      active: z.boolean().default(true),
      notifyOnViolation: z.boolean().default(true),
      notifyOnRunComplete: z.boolean().default(false),
    }))
    .mutation(({ input }) => upsertAlertConfig(input)),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteAlertConfig(input.id)),
});

// ─── Settings Router ──────────────────────────────────────────────────────────
const settingsRouter = router({
  getAll: protectedProcedure.query(() => getAllSettings()),

  update: protectedProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(({ input }) => upsertSetting(input.key, input.value)),

  init: protectedProcedure.mutation(() => initDefaultSettings()),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  products: productsRouter,
  monitoring: monitoringRouter,
  violations: violationsRouter,
  clientes: clientesRouter,
  vendedores: vendedoresRouter,
  alerts: alertsRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
