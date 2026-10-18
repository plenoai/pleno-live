import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  authToken: string | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const authHeader = opts.req.headers.authorization;
  const authToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  return {
    req: opts.req,
    res: opts.res,
    authToken,
  };
}
