import type { RealtimeProvider } from "@/packages/types/realtime-transcription";
import { REALTIME_TOKEN_PATHS } from "./realtime-client";

type Fetch = typeof fetch;

function normalizeApiBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * プロバイダに対応するリアルタイム文字起こしトークンを取得する
 *
 * - `elevenlabs`: ElevenLabs の single-use token
 * - `openai`: OpenAI Realtime の ephemeral client secret
 */
export async function requestRealtimeTokenFor(
  apiBaseUrl: string,
  provider: RealtimeProvider = "elevenlabs",
  fetchImpl: Fetch = fetch,
  bearerToken?: string,
): Promise<string> {
  const path =
    REALTIME_TOKEN_PATHS[provider] ?? REALTIME_TOKEN_PATHS.elevenlabs;
  const authorizationToken =
    provider === "openai"
      ? process.env.EXPO_PUBLIC_REALTIME_TOKEN_AUTH_TOKEN
      : bearerToken;

  const response = await fetchImpl(
    `${normalizeApiBaseUrl(apiBaseUrl)}${path}`,
    {
      method: "POST",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        ...(authorizationToken
          ? { Authorization: `Bearer ${authorizationToken}` }
          : {}),
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Token request failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("token" in payload) ||
    typeof payload.token !== "string" ||
    payload.token.length === 0
  ) {
    throw new Error("Token response was invalid");
  }

  return payload.token;
}

/**
 * ElevenLabs のリアルタイムトークンを取得する（Even G2 グラス用の既存API）
 */
export async function requestRealtimeToken(
  apiBaseUrl: string,
  fetchImpl: Fetch = fetch,
  bearerToken?: string,
): Promise<string> {
  return requestRealtimeTokenFor(
    apiBaseUrl,
    "elevenlabs",
    fetchImpl,
    bearerToken,
  );
}
