import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Mock user para desenvolvimento (remover quando OAuth estiver configurado)
const DEV_USER: User = {
  id: 1,
  openId: "dev-owner",
  name: "Admin ASX",
  email: "admin@asx.com",
  loginMethod: "dev",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // ✅ Segurança: em PRODUÇÃO nunca use um usuário hardcoded.
  // ✅ Dev UX: em desenvolvimento, se não houver sessão válida, usamos um fallback.
  const allowDevBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.DISABLE_DEV_AUTH_BYPASS !== "1" &&
    process.env.DISABLE_DEV_AUTH_BYPASS !== "true";

  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }

  if (!user && allowDevBypass) {
    user = DEV_USER;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
