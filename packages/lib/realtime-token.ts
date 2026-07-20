type Fetch = typeof fetch;

function normalizeApiBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function requestRealtimeToken(
  apiBaseUrl: string,
  fetchImpl: Fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(
    `${normalizeApiBaseUrl(apiBaseUrl)}/api/even-g2/realtime-token`,
    {
      method: "POST",
      credentials: "omit",
      headers: { Accept: "application/json" },
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
