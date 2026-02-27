import { createTRPCReact } from "@trpc/react-query";
import {
  createTRPCClient as createVanillaClient,
  httpBatchLink,
} from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/apps/server/routers";
import { getSessionToken, resetAndReauth } from "@/packages/lib/auth";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

function authHeaders() {
  const token = getSessionToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export const trpc = createTRPCReact<AppRouter>();

async function fetchWithReauth(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status !== 401) return res;

  // auth.*エンドポイント自体への401は再試行しない（無限ループ防止）
  const urlStr = typeof url === "string" ? url : url.toString();
  if (urlStr.includes("auth.")) return res;

  await resetAndReauth();
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      ...authHeaders(),
    },
  });
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_BASE_URL}/api/trpc`,
        transformer: superjson,
        headers: authHeaders,
        fetch: fetchWithReauth,
      }),
    ],
  });
}

export function createVanillaTRPCClient() {
  return createVanillaClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_BASE_URL}/api/trpc`,
        transformer: superjson,
        headers: authHeaders,
        fetch: fetchWithReauth,
      }),
    ],
  });
}
