import "dotenv/config";
import express from "express";
import { startScheduler } from "../mlScraper";
import { initDefaultSettings } from "../db";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // ML OAuth redirect route (direct Express, bypasses React click issues)
  app.get("/api/ml/authorize", async (req, res) => {
    try {
      const { getMlCredentials } = await import("../db");
      const cred = await getMlCredentials();
      if (!cred) {
        return res.status(400).json({ error: "Configure o App ID e Client Secret primeiro." });
      }
      const origin = req.query.origin as string || `${req.protocol}://${req.get('host')}`;
      const redirectUri = cred.redirectUri || `${origin}/ml`;

      // Gerar PKCE code_verifier
      const crypto = await import("crypto");
      const codeVerifierBytes = crypto.randomBytes(32);
      const codeVerifier = codeVerifierBytes
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      // Gerar code_challenge = BASE64URL(SHA-256(code_verifier))
      const digest = crypto.createHash("sha256").update(codeVerifier).digest();
      const codeChallenge = digest
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      // Salvar code_verifier no cookie para recuperar no callback
      res.cookie("ml_code_verifier", codeVerifier, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 10 * 60 * 1000, // 10 minutos
        path: "/",
      });

      const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${cred.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      console.log(`[ML OAuth] Redirecting to ML auth: ${authUrl.substring(0, 100)}...`);
      res.redirect(authUrl);
    } catch (err: any) {
      console.error("[ML OAuth] Error generating auth URL:", err);
      res.status(500).json({ error: err.message || "Erro interno" });
    }
  });

  // ─── Ingestão ML (nova arquitetura) ─────────────────────────────────────────
  // POST /api/ingest/ml-listings
  // Recebe lotes de anúncios coletados por agente externo (extensão/collector)
  app.post("/api/ingest/ml-listings", async (req, res) => {
    try {
      const { processIngestion, validateApiKey } = await import("../ingestionProcessor");
      const payload = req.body;

      // Validação da API key
      const apiKey = (req.headers["x-api-key"] as string) || payload?.apiKey || "";
      if (!validateApiKey(apiKey)) {
        return res.status(401).json({ error: "API key inválida ou ausente" });
      }

      // Validação mínima do payload
      if (!payload?.listings || !Array.isArray(payload.listings)) {
        return res.status(400).json({ error: "Campo 'listings' obrigatório (array)" });
      }
      if (payload.listings.length === 0) {
        return res.status(400).json({ error: "listings não pode ser vazio" });
      }
      if (payload.listings.length > 500) {
        return res.status(400).json({ error: "Máximo 500 listings por requisição" });
      }

      // Processar ingestão em background (não bloqueia a resposta)
      const result = await processIngestion({ ...payload, apiKey });

      return res.status(200).json({
        success: true,
        runId: result.runId,
        accepted: result.accepted,
        processed: result.processed,
        violations: result.violations,
        skipped: result.skipped,
        errors: result.errors.slice(0, 10), // limita erros na resposta
      });
    } catch (err: any) {
      console.error("[Ingest] Erro:", err.message);
      return res.status(500).json({ error: err.message || "Erro interno" });
    }
  });

  // GET /api/ingest/status - verifica se o endpoint está ativo
  app.get("/api/ingest/status", (_req, res) => {
    res.json({ status: "ok", version: "2.0.0", endpoints: [
      "POST /api/ingest/ml-listings",
      "POST /api/ingest/ml-checks",
      "GET /api/tracked/recheck",
    ]});
  });

  // ─── Tracked Listings: verificações pontuais ─────────────────────────────────
  // POST /api/ingest/ml-checks
  // Recebe verificações de anúncios conhecidos (extensão verifica anúncios da lista)
  app.post("/api/ingest/ml-checks", async (req, res) => {
    try {
      const { processChecks, validateApiKey } = await import("../trackedListingsProcessor");
      const payload = req.body;

      const apiKey = (req.headers["x-api-key"] as string) || payload?.apiKey || "";
      if (!validateApiKey(apiKey)) {
        return res.status(401).json({ error: "API key inválida ou ausente" });
      }

      if (!payload?.checks || !Array.isArray(payload.checks)) {
        return res.status(400).json({ error: "Campo 'checks' obrigatório (array)" });
      }
      if (payload.checks.length === 0) {
        return res.status(400).json({ error: "checks não pode ser vazio" });
      }
      if (payload.checks.length > 200) {
        return res.status(400).json({ error: "Máximo 200 checks por requisição" });
      }

      const result = await processChecks({ ...payload, apiKey });
      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error("[Checks] Erro:", err.message);
      return res.status(500).json({ error: err.message || "Erro interno" });
    }
  });

  // GET /api/tracked/recheck - retorna lista de anúncios que precisam ser verificados
  app.get("/api/tracked/recheck", async (req, res) => {
    try {
      const apiKey = (req.headers["x-api-key"] as string) || "";
      const { validateApiKey, getListingsForRecheck } = await import("../trackedListingsProcessor");
      if (!validateApiKey(apiKey)) {
        return res.status(401).json({ error: "API key inválida ou ausente" });
      }
      const limit = parseInt(req.query.limit as string || "100");
      const staleSinceHours = parseInt(req.query.staleSinceHours as string || "6");
      const listings = await getListingsForRecheck({ limit, staleSinceHours });
      return res.status(200).json({ listings, count: listings.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Erro interno" });
    }
  });

  // ─── Download da Extensão Chrome ASX Collector ──────────────────────────────
  app.get("/api/extension/download", async (_req, res) => {
    try {
      const path = await import("path");
      const fs = await import("fs");
      const { createReadStream, readdirSync, statSync } = fs;
      const archiver = await import("archiver").catch(() => null);

      const extDir = path.join(__dirname, "..", "asx-collector-extension");

      // Check if extension directory exists
      if (!fs.existsSync(extDir)) {
        return res.status(404).json({ error: "Extensão não encontrada no servidor." });
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=asx-collector-extension.zip");

      if (archiver) {
        // Use archiver if available
        const archive = archiver.default("zip", { zlib: { level: 9 } });
        archive.pipe(res);
        archive.directory(extDir, false);
        await archive.finalize();
      } else {
        // Fallback: serve files as a simple JSON manifest for manual download
        const files: Record<string, string> = {};
        const entries = readdirSync(extDir);
        for (const entry of entries) {
          const filePath = path.join(extDir, entry);
          if (statSync(filePath).isFile() && !entry.endsWith(".svg")) {
            files[entry] = fs.readFileSync(filePath, "utf-8");
          }
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", "attachment; filename=asx-collector-extension.json");
        return res.json({
          instructions: "Crie uma pasta, salve cada arquivo abaixo com o nome indicado, depois carregue no Chrome.",
          files,
        });
      }
    } catch (err: any) {
      console.error("[Extension Download] Error:", err.message);
      return res.status(500).json({ error: "Erro ao gerar download da extensão." });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Init default settings and start ML scraper scheduler
  try {
    await initDefaultSettings();
    startScheduler();
    console.log("[ASX] Default settings initialized and scheduler started");
  } catch (e) {
    console.warn("[ASX] Could not init settings/scheduler:", e);
  }
}

startServer().catch(console.error);
