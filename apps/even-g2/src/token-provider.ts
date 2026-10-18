import { requestRealtimeToken } from "../../../packages/lib/realtime-token";

const DEFAULT_API_BASE_URL = "https://live.plenoai.com";

type Fetch = typeof fetch;

export function createRealtimeTokenProvider(
  apiBaseUrl = import.meta.env.VITE_PLENO_API_URL || DEFAULT_API_BASE_URL,
  fetchImpl: Fetch = fetch,
  bearerToken = import.meta.env.VITE_PLENO_REALTIME_TOKEN_SECRET,
): () => Promise<string> {
  return () => requestRealtimeToken(apiBaseUrl, fetchImpl, bearerToken);
}
