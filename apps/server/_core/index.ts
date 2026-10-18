import "dotenv/config";
import express from "express";
import { createServer } from "http";
import crypto from "crypto";
import net from "net";
import serverless from "serverless-http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import {
  RealtimeTokenRateLimiter,
  REALTIME_TOKEN_FACTORIES,
  issueRealtimeToken,
  type RealtimeTokenProvider,
} from "../realtime-token";
import { isAuthorizedRealtimeTokenRequest } from "../realtime-token-auth";
import { isAllowedOrigin } from "./cors";

const realtimeTokenLimiter = new RealtimeTokenRateLimiter();
// Even G2 グラス向けに公開済みのパス。互換性のため維持している。
const EVEN_G2_TOKEN_PATH = "/api/even-g2/realtime-token";
const OPENAI_TOKEN_PATH = "/api/openai/realtime-token";
const REALTIME_TOKEN_PATHS: Record<string, RealtimeTokenProvider> = {
  [EVEN_G2_TOKEN_PATH]: "elevenlabs",
  [OPENAI_TOKEN_PATH]: "openai",
};

/**
 * トークン発行エンドポイントかどうかを判定する（末尾スラッシュも許容）
 */
function resolveRealtimeTokenProvider(
  path: string,
): RealtimeTokenProvider | null {
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  return REALTIME_TOKEN_PATHS[normalized] ?? null;
}

/**
 * Even G2 グラス向けトークン発行に必要な共有シークレット。
 * 未設定の場合はトークンサービスを提供しない。
 */
function getEvenG2TokenSecret(): string | undefined {
  const secret = process.env.EVEN_G2_REALTIME_TOKEN_SECRET?.trim();
  return secret && secret.length > 0 ? secret : undefined;
}

/**
 * Authorization ヘッダが Even G2 用シークレットと一致するか定数時間で検証する。
 */
function hasValidBearerToken(authorization: string | undefined): boolean {
  const expectedSecret = getEvenG2TokenSecret();
  if (!expectedSecret || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const suppliedSecret = authorization.slice("Bearer ".length);
  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);
  return (
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected)
  );
}

function createApp() {
  const app = express();

  // Enable CORS for all routes - allow only trusted origins
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const tokenProvider = resolveRealtimeTokenProvider(req.path);
    // Realtime tokens are minted only for allowlisted web origins. Other
    // token clients (e.g. the mobile app) have no browser origin.
    const isRealtimeTokenRequest = tokenProvider !== null;

    res.vary("Origin");

    if (isRealtimeTokenRequest) {
      if (origin && isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
        res.header("Access-Control-Allow-Origin", origin);
      }
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Accept, Content-Type, Authorization",
      );
    } else {
      if (origin && isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
      }
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      );
    }

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.post([EVEN_G2_TOKEN_PATH, OPENAI_TOKEN_PATH], async (req, res) => {
    res.set({
      "Cache-Control": "no-store, max-age=0",
      Expires: "0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    });

    const provider = resolveRealtimeTokenProvider(req.path);

    // Even G2 realtime tokens are minted only for authenticated callers.
    if (provider === "elevenlabs") {
      if (!getEvenG2TokenSecret()) {
        res.status(503).json({ error: "Token service is not configured" });
        return;
      }

      if (!hasValidBearerToken(req.headers.authorization)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const contentLength = Number(req.headers["content-length"] || 0);
    const bufferedBodyLength = Buffer.isBuffer(req.body) ? req.body.length : 0;
    if (
      req.headers["transfer-encoding"] !== undefined ||
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > 0 ||
      bufferedBodyLength > 0
    ) {
      res.status(413).json({ error: "Request body not allowed" });
      return;
    }

    if (!provider) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (
      provider === "openai" &&
      !isAuthorizedRealtimeTokenRequest(req.headers.authorization)
    ) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const clientId = req.socket.remoteAddress || "unknown";
    const result = await issueRealtimeToken(
      clientId,
      realtimeTokenLimiter,
      REALTIME_TOKEN_FACTORIES[provider],
    );

    if (!result.ok) {
      if (result.status === 429) {
        res.setHeader("Retry-After", String(result.retryAfterSeconds));
      }
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ token: result.token });
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/api/health", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, version: process.env.APP_COMMIT || "development", timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  return app;
}

// Lambda handler export
export const handler = serverless(createApp());

// Local development server
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
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
  const app = createApp();
  const server = createServer(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

// Only start server in local development (not in Lambda)
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer().catch(console.error);
}
