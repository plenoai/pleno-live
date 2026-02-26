import { createTRPCReact } from "@trpc/react-query";
import {
  createTRPCClient as createVanillaClient,
  httpBatchLink,
} from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/apps/server/routers";
import { getSessionToken } from "@/packages/lib/auth";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

function authHeaders() {
  const token = getSessionToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_BASE_URL}/api/trpc`,
        transformer: superjson,
        headers: authHeaders,
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
      }),
    ],
  });
}
