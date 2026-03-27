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
import { runScraper, startScheduler, matchProduct } from "./mlScraper";
import { getDb } from "./db";
import { monitoringRuns, priceSnapshots, violations, clientes, mlCredentials, mlIngestionRuns, trackedListings, trackedListingChecks, matchReviewQueue, products } from "../drizzle/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
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
        return {
          success: true,
          found: result.found,
          violations: result.violations,
          runId: result.runId,
          message: `Monitoramento concluído: ${result.found} anúncios, ${result.violations} violações.`,
        };
      } catch (err) {
        markRunFinished(false);
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("já em execução") || message.includes("em execução")) {
          throw new TRPCError({ code: "CONFLICT", message });
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

  upsert: adminProcedure
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

  // Gera a URL de autorização OAuth do ML com suporte a PKCE (obrigatório quando pkce=true no App ML)
  getAuthUrl: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .query(async ({ input }) => {
      const cred = await getMlCredentials();
      if (!cred) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Configure o App ID e Client Secret primeiro." });
      }
      // Usar o redirectUri salvo no banco; se não houver, usar origin + /ml
      const redirectUri = cred.redirectUri || `${input.origin}/ml`;

      // Gerar PKCE code_verifier (43-128 chars, URL-safe base64)
      const codeVerifierBytes = new Uint8Array(32);
      crypto.getRandomValues(codeVerifierBytes);
      const codeVerifier = Buffer.from(codeVerifierBytes)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      // Gerar code_challenge = BASE64URL(SHA-256(code_verifier))
      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);
      const digest = await crypto.subtle.digest("SHA-256", data);
      const codeChallenge = Buffer.from(digest)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${cred.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      return { authUrl, redirectUri, codeVerifier };
    }),

  // Testa a conexão com a API ML usando o token salvo
  testConnection: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem testar a conexão ML." });
    }
    const cred = await getMlCredentials();
    if (!cred?.accessToken) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum token de acesso disponível. Autorize primeiro." });
    }
    // Testar token com endpoint /users/me
    const res = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${cred.accessToken}` },
    });
    if (!res.ok) {
      const errText = await res.text();
      // Se expirado, marcar no banco
      if (res.status === 401) {
        await updateMlTokens({ status: "expired", lastError: "Token expirado. Use Renovar Token." });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Token expirado. Clique em Renovar Token." });
      }
      throw new TRPCError({ code: "BAD_REQUEST", message: `Erro na API ML: ${errText}` });
    }
    const userData = await res.json() as { id: number; nickname: string; email: string; site_id: string };
    return {
      ok: true,
      userId: userData.id,
      nickname: userData.nickname,
      email: userData.email,
      siteId: userData.site_id,
    };
  }),

  // Troca o code pelo access_token (chamado após o callback OAuth)
  exchangeCode: protectedProcedure
    .input(z.object({
      code: z.string(),
      redirectUri: z.string().url(),
      codeVerifier: z.string().optional(), // PKCE: obrigatório quando o App ML tem pkce=true
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem autorizar credenciais ML." });
      }
      const cred = await getMlCredentials();
      if (!cred) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Configure o App ID e Client Secret primeiro." });
      }
      // Tentar recuperar code_verifier: do input ou do cookie
      let codeVerifier = input.codeVerifier;
      if (!codeVerifier) {
        const cookieHeader = ctx.req.headers.cookie || "";
        const match = cookieHeader.match(/ml_code_verifier=([^;]+)/);
        if (match) {
          codeVerifier = decodeURIComponent(match[1]);
          console.log("[ML OAuth] code_verifier recuperado do cookie");
        }
      }

      // Montar body da troca de token (com ou sem PKCE)
      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        client_id: cred.appId,
        client_secret: cred.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
      };
      // Adicionar code_verifier se PKCE estiver sendo usado
      if (codeVerifier) {
        tokenBody.code_verifier = codeVerifier;
      }
      // Trocar code por token
      const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: new URLSearchParams(tokenBody),
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

  // Retorna o access_token para uso client-side (apenas admin) — com auto-refresh via client_credentials
  getAccessToken: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem acessar o token ML." });
    }
    let cred = await getMlCredentials();
    // Auto-refresh: se não há token válido ou expira em < 30 min, renova via client_credentials
    const needsRefresh = !cred?.accessToken || cred.status !== "authorized" ||
      (cred.expiresAt && new Date(cred.expiresAt).getTime() - Date.now() < 30 * 60 * 1000);
    if (needsRefresh && cred?.appId && cred?.clientSecret) {
      try {
        const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: cred.appId,
            client_secret: cred.clientSecret,
          }),
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json() as { access_token: string; expires_in: number };
          const db = await getDb();
          if (db) {
            await db.update(mlCredentials).set({
              accessToken: tokenData.access_token,
              status: "authorized",
              expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
              updatedAt: new Date(),
            }).where(eq(mlCredentials.id, cred.id));
          }
          cred = { ...cred, accessToken: tokenData.access_token, status: "authorized" };
          console.log("[ML] Token auto-refreshed via client_credentials");
        }
      } catch (e) {
        console.warn("[ML] Auto-refresh failed:", e);
      }
    }
    if (!cred || cred.status !== "authorized" || !cred.accessToken) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Token ML não disponível. Autorize primeiro em /ml." });
    }
    return {
      accessToken: cred.accessToken,
      siteId: cred.siteId ?? "MLB",
      expiresAt: cred.expiresAt,
    };
  }),

  // Retorna clientes ativos para o browser executar as buscas
  getClientesForBrowserCheck: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
    const rows = await db.select().from(clientes).where(eq(clientes.status, "ativo"));
    return rows.map((c: typeof rows[number]) => ({ id: c.id, nome: c.nome, sellerId: c.sellerId, lojaML: c.lojaML }));
  }),

  // Recebe resultados coletados pelo browser e processa/salva no banco
  submitBrowserResults: protectedProcedure
    .input(z.object({
      clienteId: z.number(),
      clienteNome: z.string(),
      sellerId: z.string(),
      items: z.array(z.object({
        mlbId: z.string(),
        title: z.string(),
        price: z.number(),
        url: z.string(),
        thumbnail: z.string().optional().default(""),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const runResult = await db.insert(monitoringRuns).values({
        triggeredBy: "manual",
        status: "running",
        startedAt: new Date(),
        totalFound: 0,
        totalViolations: 0,
      }).returning({ id: monitoringRuns.id });
      const runId = runResult[0]?.id;
      if (!runId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar run" });

      const catalog = await getActiveProducts();
      const catalogForMatch = catalog.map(p => ({
        id: p.id,
        codigo: p.codigo,
        descricao: p.descricao,
        ean: p.ean,
        precoMinimo: p.precoMinimo,
      }));

      let totalFound = 0;
      let totalViolations = 0;
      const seenIds = new Set<string>();

      for (const item of input.items) {
        if (!item.mlbId || seenIds.has(item.mlbId)) continue;
        seenIds.add(item.mlbId);
        const match = matchProduct(item.title, catalogForMatch);
        if (!match || match.confianca < 50) continue;
        totalFound++;
        const precoMin = parseFloat(String(match.precoMinimo));
        const isViolation = item.price < precoMin;
        if (isViolation) totalViolations++;
        const snap = await db.insert(priceSnapshots).values({
          runId,
          productId: match.productId,
          sellerName: input.clienteNome,
          sellerId: input.sellerId,
          clienteId: input.clienteId,
          mlItemId: item.mlbId,
          mlTitle: item.title,
          mlUrl: item.url,
          mlThumbnail: item.thumbnail ?? "",
          plataforma: "mercadolivre",
          precoAnunciado: String(item.price),
          precoMinimo: String(precoMin),
          isViolation,
          validationReason: isViolation ? `Abaixo do mínimo (R$${precoMin.toFixed(2)})` : null,
          confianca: match.confianca,
          metodoMatch: match.metodoMatch,
        }).returning({ id: priceSnapshots.id });
        if (isViolation) {
          await db.insert(violations).values({
            snapshotId: snap[0]?.id ?? 0,
            runId,
            productId: match.productId,
            sellerName: input.clienteNome,
            sellerId: input.sellerId,
            clienteId: input.clienteId,
            mlItemId: item.mlbId,
            mlUrl: item.url,
            mlThumbnail: item.thumbnail ?? "",
            mlTitle: item.title,
            plataforma: "mercadolivre",
            precoAnunciado: String(item.price),
            precoMinimo: String(precoMin),
            diferenca: String((precoMin - item.price).toFixed(2)),
            percentAbaixo: String(((precoMin - item.price) / precoMin * 100).toFixed(2)),
            confianca: match.confianca,
            metodoMatch: match.metodoMatch,
          });
        }
      }

      await db.update(monitoringRuns).set({
        status: "completed",
        finishedAt: new Date(),
        totalFound,
        totalViolations,
      }).where(eq(monitoringRuns.id, runId));

      await db.update(clientes).set({
        totalProdutos: totalFound,
        totalViolacoes: totalViolations,
        ultimaVerificacao: new Date(),
      }).where(eq(clientes.id, input.clienteId));

      return { runId, totalFound, totalViolations };
    }),
});

// ─── Ingestion Router ──────────────────────────────────────────────────────────
const ingestionRouter = router({
  // Listar runs de ingestão recentes
  getRuns: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const runs = await db
          .select()
          .from(mlIngestionRuns)
          .orderBy(desc(mlIngestionRuns.startedAt))
          .limit(input?.limit || 20);
        return runs;
      } catch { return []; }
    }),

  // Estatísticas de ingestão
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalRuns: 0, totalProcessed: 0, totalViolations: 0, lastRun: null };
    try {
      const runs = await db
        .select()
        .from(mlIngestionRuns)
        .orderBy(desc(mlIngestionRuns.startedAt))
        .limit(100);
      return {
        totalRuns: runs.length,
        totalProcessed: runs.reduce((s: number, r: typeof mlIngestionRuns.$inferSelect) => s + (r.processedListings || 0), 0),
        totalViolations: runs.reduce((s: number, r: typeof mlIngestionRuns.$inferSelect) => s + (r.violationsFound || 0), 0),
        lastRun: runs[0]?.startedAt || null,
      };
    } catch { return { totalRuns: 0, totalProcessed: 0, totalViolations: 0, lastRun: null }; }
  }),

  // Obter API Key configurada
  getApiKey: protectedProcedure.query(async () => {
    const key = process.env.INGEST_API_KEY || "asx-ingest-2026";
    return { apiKey: key, endpoint: "/api/ingest/ml-listings" };
  }),
});

// Tracked Listings Router
const trackedRouter = router({
  // Listar anúncios monitorados com filtros
  getListings: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      clienteId: z.number().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { listings: [], total: 0 };
      try {
        const conditions: any[] = [];
        if (input?.status) conditions.push(eq(trackedListings.listingStatus, input.status));
        if (input?.clienteId) conditions.push(eq(trackedListings.clienteId, input.clienteId));

        const query = db.select().from(trackedListings);
        const filtered = conditions.length > 0 ? query.where(and(...conditions)) : query;
        const listings = await filtered
          .orderBy(desc(trackedListings.updatedAt))
          .limit(input?.limit || 50)
          .offset(input?.offset || 0);
        return { listings, total: listings.length };
      } catch { return { listings: [], total: 0 }; }
    }),

  // Estatísticas dos anúncios monitorados
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    try {
      const { getTrackedListingsStats } = await import("./trackedListingsProcessor");
      return await getTrackedListingsStats();
    } catch { return null; }
  }),

  // Histórico de checks de um anúncio
  getChecks: protectedProcedure
    .input(z.object({ trackedListingId: z.number(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        return await db
          .select()
          .from(trackedListingChecks)
          .where(eq(trackedListingChecks.trackedListingId, input.trackedListingId))
          .orderBy(desc(trackedListingChecks.checkedAt))
          .limit(input.limit);
      } catch { return []; }
    }),

  // Promover anúncios da ingestão para tracked_listings
  promoteFromIngestion: protectedProcedure
    .input(z.object({ sinceHours: z.number().default(24), limit: z.number().default(500) }).optional())
    .mutation(async ({ input }) => {
      try {
        const { promoteNewListings } = await import("./trackedListingsProcessor");
        return await promoteNewListings(input || {});
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
      }
    }),

  // Inativar um anúncio manualmente
  inactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(trackedListings).set({
        listingStatus: "inativo",
        inactivatedAt: new Date(),
        inactivationReason: input.reason || "Inativado manualmente",
        updatedAt: new Date(),
      }).where(eq(trackedListings.id, input.id));
      return { success: true };
    }),

  // Obter lista de anúncios para recheck (para a extensão)
  getForRecheck: protectedProcedure
    .input(z.object({ limit: z.number().default(100), staleSinceHours: z.number().default(6) }).optional())
    .query(async ({ input }) => {
      try {
        const { getListingsForRecheck } = await import("./trackedListingsProcessor");
        return await getListingsForRecheck(input || {});
      } catch { return []; }
    }),
});

// Match Review Queue Router
const reviewRouter = router({
  // Listar itens pendentes de revisão
  getPending: protectedProcedure
    .input(z.object({ limit: z.number().default(30) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        // Join com tracked_listings e products para exibir contexto
        const items = await db
          .select()
          .from(matchReviewQueue)
          .where(eq(matchReviewQueue.status, "pending"))
          .orderBy(desc(matchReviewQueue.createdAt))
          .limit(input?.limit || 30);

        // Enriquecer com dados do tracked_listing
        type ReviewItem = typeof matchReviewQueue.$inferSelect;
        const enriched = await Promise.all(items.map(async (item: ReviewItem) => {
          const [listing] = await db
            .select()
            .from(trackedListings)
            .where(eq(trackedListings.id, item.trackedListingId))
            .limit(1);
          const suggestedProduct = item.suggestedProductId
            ? (await db.select().from(products).where(eq(products.id, item.suggestedProductId)).limit(1))[0]
            : null;
          return { ...item, listing, suggestedProduct };
        }));
        return enriched;
      } catch { return []; }
    }),

  // Aprovar/Rejeitar item da fila
  review: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      decision: z.enum(["approved", "rejected", "skipped"]),
      correctProductId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const { reviewMatchQueueItem } = await import("./trackedListingsProcessor");
        const reviewedBy = ctx.user?.name || ctx.user?.email || "admin";
        await reviewMatchQueueItem(
          input.itemId,
          input.decision,
          reviewedBy,
          input.notes,
          input.correctProductId
        );
        return { success: true };
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
      }
    }),

  // Contagem de pendentes
  getCount: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return 0;
    try {
      const items = await db
        .select()
        .from(matchReviewQueue)
        .where(eq(matchReviewQueue.status, "pending"));
      return items.length;
    } catch { return 0; }
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
  ingestion: ingestionRouter,
  tracked: trackedRouter,
  review: reviewRouter,
});

export type AppRouter = typeof appRouter;
