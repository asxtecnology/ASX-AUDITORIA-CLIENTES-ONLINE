import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
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
  getViolationTrendBySlot,
  getViolations,
  initDefaultSettings,
  toggleProductActive,
  updateProduct,
  updateViolationStatus,
  upsertAlertConfig,
  upsertProduct,
  upsertSetting,
  getSnapshotsByProduct,
  getMlCredentials,
  saveMlCredentials,
  updateMlTokens,
  deleteMlCredentials,
  getClientes,
  getClienteById,
  upsertCliente,
  deleteCliente,
  getVendedores,
  getViolationsByCliente,
  getHistoricoPrecos,
  recalculateAllProductPrices,
} from "./db";
import { runScraper, startScheduler } from "./mlScraper";
import { TRPCError } from "@trpc/server";

// Rate Limiter (in-memory, per-server)
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutos entre execucoes
let lastRunFinishedAt = 0;
let runInProgress = false;

function assertCanRun() {
  const now = Date.now();
  if (runInProgress) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Já existe um monitoramento em execução.",
    });
  }
  if (now - lastRunFinishedAt < RATE_LIMIT_MS) {
    const waitSecs = Math.ceil(
      (RATE_LIMIT_MS - (now - lastRunFinishedAt)) / 1000
    );
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Aguarde ${waitSecs}s antes de executar novamente.`,
    });
  }
  runInProgress = true;
}

function markRunFinished(success: boolean) {
  runInProgress = false;
  if (success) {
    lastRunFinishedAt = Date.now();
  }
}

// Products Router
const productsRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      ativo: z.boolean().optional(),
      categoria: z.string().optional(),
      linha: z.string().optional(),
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

  import: adminProcedure
    .input(z.array(z.object({
      codigo: z.string(),
      descricao: z.string(),
      ean: z.string().optional(),
      categoria: z.string().optional(),
      linha: z.string().optional(),
      precoCusto: z.string(),
      precoMinimo: z.string(),
      margemPercent: z.string().optional(),
    })))
    .mutation(async ({ input }) => {
      let imported = 0;
      let skipped = 0;
      for (const p of input) {
        try {
          await upsertProduct({
            ...p,
            margemPercent: p.margemPercent ?? "60.00",
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

// Monitoring Router
const monitoringRouter = router({
  runNow: protectedProcedure
    .input(z.object({ clienteId: z.number().optional() }).optional())
    .mutation(async ({ input }) => {
      assertCanRun();
      try {
        const result = await runScraper({
          triggeredBy: "manual",
          clienteId: input?.clienteId,
        });
        markRunFinished(true);
        return result;
      } catch (err) {
        markRunFinished(false);
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("já em execução") || message.includes("em execução")) {
          throw new TRPCError({
            code: "CONFLICT",
            message,
          });
        }
        throw err;
      }
    }),

  history: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(({ input }) => getMonitoringRuns(input.limit)),

  latest: protectedProcedure
    .query(async () => {
      const run = await getLatestMonitoringRun();
      return run ?? null;
    }),

  stats: protectedProcedure
    .query(() => getViolationStats()),

  trend: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(({ input }) => getViolationTrend(input.days)),
  trendBySlot: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(({ input }) => getViolationTrendBySlot(input.days)),
});

// Violations Router
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

// Clientes Router
const clientesRouter = router({
  list: protectedProcedure
    .query(() => getClientes()),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getClienteById(input.id)),

  upsert: adminProcedure
    .input(z.object({
      id: z.number().optional(),
      nome: z.string().min(1),
      sellerId: z.string().min(1),
      lojaML: z.string().optional(),
      linkLoja: z.string().optional(),
      status: z.enum(["ativo", "inativo"]).default("ativo"),
    }))
    .mutation(({ input }) => upsertCliente(input)),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteCliente(input.id)),

  runCheck: protectedProcedure
    .input(z.object({ clienteId: z.number() }))
    .mutation(async ({ input }) => {
      assertCanRun();
      try {
        const result = await runScraper({
          triggeredBy: "manual",
          clienteId: input.clienteId,
        });
        markRunFinished(true);
        return result;
      } catch (err) {
        markRunFinished(false);
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("já em execução") || message.includes("em execução")) {
          throw new TRPCError({
            code: "CONFLICT",
            message,
          });
        }
        throw err;
      }
    }),
});

// Vendedores Router
const vendedoresRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
      orderBy: z.enum(["totalViolacoes", "totalAnuncios"]).default("totalViolacoes"),
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

// Alerts Router
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

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteAlertConfig(input.id)),
});

// Settings Router — com recalculateAllProductPrices ao mudar margem_percent
const settingsRouter = router({
  getAll: protectedProcedure.query(() => getAllSettings()),

  update: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      await upsertSetting(input.key, input.value);
      // Quando margem muda → recalcula precoMinimo de todos os produtos
      if (input.key === "margem_percent") {
        const margem = parseFloat(input.value);
        if (!isNaN(margem) && margem > 0) {
          await recalculateAllProductPrices(margem);
        }
      }

      // Mudanças no agendador devem refletir imediatamente.
      if (input.key === "scraper_ativo" || input.key === "scraper_hora") {
        startScheduler();
      }
      return { ok: true };
    }),

  init: protectedProcedure.mutation(() => initDefaultSettings()),
});

// Mercado Livre OAuth Router
const mlRouter = router({
  // Retorna as credenciais salvas (sem expor client_secret completo)
  getCredentials: protectedProcedure.query(async () => {
    const cred = await getMlCredentials();
    if (!cred) return null;
    return {
      id: cred.id,
      appId: cred.appId,
      // Mascara o secret: mostra apenas os 4 primeiros e 4 últimos caracteres
      clientSecretMasked: cred.clientSecret
        ? cred.clientSecret.substring(0, 4) + "****" + cred.clientSecret.substring(cred.clientSecret.length - 4)
        : null,
      siteId: cred.siteId,
      redirectUri: cred.redirectUri,
      status: cred.status,
      mlUserId: cred.mlUserId,
      mlNickname: cred.mlNickname,
      mlEmail: cred.mlEmail,
      expiresAt: cred.expiresAt,
      scope: cred.scope,
      lastError: cred.lastError,
      updatedAt: cred.updatedAt,
    };
  }),

  // Salva App ID e Client Secret (configuração inicial)
  saveCredentials: protectedProcedure
    .input(
      z.object({
        appId: z.string().min(1, "App ID obrigatório"),
        clientSecret: z.string().min(1, "Client Secret obrigatório"),
        siteId: z.enum(["MLB", "MLA", "MLM", "MLE", "MLC", "MCO", "MPE", "MLU"]).default("MLB"),
        redirectUri: z.string().url("URL de redirecionamento inválida").optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem configurar credenciais ML." });
      }
      await saveMlCredentials(input);
      return { ok: true };
    }),

  // Gera a URL de autorização OAuth do ML para o usuário clicar
  getAuthUrl: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .query(async ({ input }) => {
      const cred = await getMlCredentials();
      if (!cred) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Configure o App ID e Client Secret primeiro." });
      }
      const redirectUri = cred.redirectUri || `${input.origin}/api/ml/callback`;
      const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${cred.appId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
      return { authUrl, redirectUri };
    }),

  // Troca o code pelo access_token (chamado após o callback OAuth)
  exchangeCode: protectedProcedure
    .input(z.object({ code: z.string(), redirectUri: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem autorizar credenciais ML." });
      }
      const cred = await getMlCredentials();
      if (!cred) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Configure o App ID e Client Secret primeiro." });
      }
      // Trocar code por token
      const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: cred.appId,
          client_secret: cred.clientSecret,
          code: input.code,
          redirect_uri: input.redirectUri,
        }),
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        await updateMlTokens({ status: "error", lastError: errText });
        throw new TRPCError({ code: "BAD_REQUEST", message: `Erro ao trocar código: ${errText}` });
      }
      const tokenData = await tokenRes.json() as {
        access_token: string;
        token_type: string;
        expires_in: number;
        scope: string;
        user_id: number;
        refresh_token: string;
      };
      // Buscar dados do usuário ML
      let mlNickname = "";
      let mlEmail = "";
      try {
        const userRes = await fetch(`https://api.mercadolibre.com/users/${tokenData.user_id}`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (userRes.ok) {
          const userData = await userRes.json() as { nickname: string; email: string };
          mlNickname = userData.nickname || "";
          mlEmail = userData.email || "";
        }
      } catch (_) { /* ignora erro ao buscar dados do usuário */ }

      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      await updateMlTokens({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type,
        expiresAt,
        scope: tokenData.scope,
        mlUserId: String(tokenData.user_id),
        mlNickname,
        mlEmail,
        status: "authorized",
        lastError: null,
      });
      return { ok: true, mlNickname, mlEmail, expiresAt };
    }),

  // Renova o access_token usando o refresh_token
  refreshToken: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem renovar tokens ML." });
    }
    const cred = await getMlCredentials();
    if (!cred?.refreshToken) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum refresh_token disponível. Autorize novamente." });
    }
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: cred.appId,
        client_secret: cred.clientSecret,
        refresh_token: cred.refreshToken,
      }),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      await updateMlTokens({ status: "error", lastError: errText });
      throw new TRPCError({ code: "BAD_REQUEST", message: `Erro ao renovar token: ${errText}` });
    }
    const tokenData = await tokenRes.json() as {
      access_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
      refresh_token: string;
    };
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    await updateMlTokens({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type,
      expiresAt,
      scope: tokenData.scope,
      status: "authorized",
      lastError: null,
    });
    return { ok: true, expiresAt };
  }),

  // Remove as credenciais ML
  deleteCredentials: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem remover credenciais ML." });
    }
    await deleteMlCredentials();
    return { ok: true };
  }),
});

// App Router
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
  ml: mlRouter,
});

export type AppRouter = typeof appRouter;
