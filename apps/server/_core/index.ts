import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import serverless from "serverless-http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";

function createApp() {
  const app = express();

  // Enable CORS for all routes - allow only trusted origins
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    // Mobile app requests have no origin; web requests must match allowlist
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // WebAuthn Associated Domains / Digital Asset Links
  // Required for native Passkeys on iOS (Associated Domains) and Android (Digital Asset Links)
  app.get("/.well-known/apple-app-site-association", (_req, res) => {
    const appId = process.env.APPLE_APP_ID || "";
    res.json({
      webcredentials: {
        apps: appId ? [appId] : [],
      },
    });
  });

  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const packageName = process.env.ANDROID_PACKAGE_NAME || "";
    const sha256Cert = process.env.ANDROID_SHA256_CERT || "";
    if (!packageName || !sha256Cert) {
      res.json([]);
      return;
    }
    res.json([{
      relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: [sha256Cert],
      },
    }]);
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
