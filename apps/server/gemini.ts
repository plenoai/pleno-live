/**
 * Gemini API Client for Audio Transcription
 * Uses Gemini's multimodal capabilities to transcribe audio
 */

import { ENV } from "./_core/env";

export interface GeminiTranscriptionOptions {
  languageCode?: string;
  mimeType?: string;
}

export interface GeminiTranscriptionResponse {
  text: string;
  languageCode: string;
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
  if (!ENV.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const mimeType = options.mimeType || "audio/webm";
  const languageHint = options.languageCode ? `in ${options.languageCode}` : "";

  // Build the request payload
  const payload = {
    contents: [
      {
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

  console.log("[Gemini] Transcribing audio with mime type:", mimeType);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": ENV.geminiApiKey,
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
  console.log("[Gemini] Transcription response received");

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
