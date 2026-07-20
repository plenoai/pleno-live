/**
 * ElevenLabs Realtime API Client
 * Scribe Realtime V2 統合
 */

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

/**
 * Get the ElevenLabs API key from environment
 */
function getApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }
  return apiKey;
}

/**
 * Generate a single-use token for realtime transcription
 *
 * トークンはクライアント側のWebSocket接続で使用されます。
 * セキュリティのため、APIキーを直接クライアントに渡さず、
 * サーバー側でワンタイムトークンを生成します。
 *
 * @returns Promise<string> - ワンタイムトークン
 */
export async function generateRealtimeToken(): Promise<string> {
  const apiKey = getApiKey();

  console.log("[ElevenLabs Realtime] Generating single-use token");

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/single-use-token/realtime_scribe`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    console.error(
      `[ElevenLabs Realtime] Token generation failed: ${response.status}`,
    );
    throw new Error(
      `Failed to generate realtime token: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { token: string };

  if (!data.token) {
    throw new Error("Token not found in response");
  }

  console.log("[ElevenLabs Realtime] Token generated successfully");
  return data.token;
}
