import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { verifySessionToken, type SessionPayload } from "./auth";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const isDevBypass =
  process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (isDevBypass) {
    return next({
      ctx: {
        ...ctx,
        session: { deviceId: "dev", platform: "dev" } satisfies SessionPayload,
      },
    });
  }

  if (!ctx.authToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing authorization token",
    });
  }

  const result = await verifySessionToken(ctx.authToken).catch(() => null);
  if (!result) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired session token",
    });
  }

  return next({
    ctx: { ...ctx, session: result },
  });
});
