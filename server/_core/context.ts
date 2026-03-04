import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
// import { sdk } from "./sdk";  // OAuth desabilitado temporariamente

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
  // TODO: Restaurar OAuth quando configurado:
  // let user: User | null = null;
  // try { user = await sdk.authenticateRequest(opts.req); } catch { user = null; }

  return {
    req: opts.req,
    res: opts.res,
    user: DEV_USER,
  };
}
