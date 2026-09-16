/**
 * Vertex AI Gemini Client for Audio Transcription
 *
 * generativelanguage.googleapis.com (AI Studio) ではなく
 * aiplatform.googleapis.com (Vertex AI) を使用。
 * Google Cloud DPA により、データはモデルの学習に使用されない。
 */

import { ENV } from "./_core/env";
import { getGoogleAccessToken } from "./_core/google-auth";
import { AUDIO_MODEL, VERTEX_LOCATION, vertexHost } from "./_core/models";

export interface GeminiTranscriptionOptions {
  languageCode?: string;
  mimeType?: string;
}

export interface GeminiTranscriptionResponse {
  text: string;
  languageCode: string;
}

/**
 * generateContent 用のリクエストボディを組み立てる。
 * 認証や fetch から分離して互換性テストから検証できるようにしている。
 */
export function buildGeminiTranscriptionPayload(
  audioBase64: string,
  options: GeminiTranscriptionOptions = {},
) {
  const mimeType = options.mimeType || "audio/webm";
  const languageHint = options.languageCode ? `in ${options.languageCode}` : "";

  return {
    contents: [
      {
        // Vertex AI の v1 generateContent は role が必須。
        // AI Studio の v1beta から移行した際に省略され 400 になっていた。
        role: "user",
        parts: [
          {
            text: `Transcribe this audio ${languageHint}. Provide only the transcription text without any additional commentary or formatting. If there are multiple speakers, separate their speech with speaker labels like [Speaker 1], [Speaker 2], etc.`,
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: audioBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };
}

/**
 * Transcribe audio using Gemini API
 * @param audioBase64 - The audio file as base64 string
 * @param options - Transcription options
 */
export async function transcribeAudioWithGemini(
  audioBase64: string,
  options: GeminiTranscriptionOptions = {}
): Promise<GeminiTranscriptionResponse> {
  if (!ENV.googleCredentials || !ENV.gcpProjectId) {
    throw new Error("GOOGLE_CREDENTIALS and GCP_PROJECT_ID are required");
  }

  const payload = buildGeminiTranscriptionPayload(audioBase64, options);

  const { gcpProjectId } = ENV;
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://${vertexHost()}/v1/projects/${gcpProjectId}/locations/${VERTEX_LOCATION}/publishers/google/models/${AUDIO_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gemini] API Error: ${response.status}`, errorText);
    throw new Error(`Gemini transcription failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  // Extract text from response
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!text) {
    throw new Error("No transcription text returned from Gemini API");
  }

  return {
    text: text.trim(),
    languageCode: options.languageCode || "auto",
  };
}
