/**
 * Vertex AI Gemini 互換性テスト（実APIを叩く）
 *
 * 本番と同じモデル・配置・リクエスト形状が通ることを確認する。
 * CI では実行しない（認証と課金が必要なため）。
 *
 * 使い方:
 *   GCP_PROJECT_ID=pleno-live pnpm exec tsx scripts/verify-vertex-models.ts
 *   GCP_PROJECT_ID=pleno-live pnpm exec tsx scripts/verify-vertex-models.ts --audio ./sample.webm
 *
 * 認証は GOOGLE_ACCESS_TOKEN、無ければ `gcloud auth print-access-token` を使う。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { AUDIO_MODEL, TEXT_MODEL, VERTEX_LOCATION, vertexHost } from "../apps/server/_core/models";
import { buildGeminiTranscriptionPayload } from "../apps/server/gemini";

const projectId = process.env.GCP_PROJECT_ID;
if (!projectId) {
  console.error("GCP_PROJECT_ID is required");
  process.exit(1);
}

const token =
  process.env.GOOGLE_ACCESS_TOKEN ??
  execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();

const host = vertexHost();
const audioFlagIndex = process.argv.indexOf("--audio");
const audioPath = audioFlagIndex === -1 ? undefined : process.argv[audioFlagIndex + 1];

const MIME_BY_EXT: Record<string, string> = {
  ".webm": "audio/webm",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aiff": "audio/aiff",
};

let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  if (!ok) failures += 1;
};

async function verifyTextModel() {
  const url = `https://${host}/v1beta1/projects/${projectId}/locations/${VERTEX_LOCATION}/endpoints/openapi/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: `google/${TEXT_MODEL}`,
      messages: [{ role: "user", content: "Reply with only: OK" }],
      max_tokens: 64,
    }),
  });
  const body = await response.text();
  const content = response.ok ? JSON.parse(body).choices?.[0]?.message?.content : undefined;
  check("text (OpenAI compat)", response.ok && Boolean(content), `${response.status} ${String(content ?? body).slice(0, 80)}`);
}

async function verifyAudioModel(path: string) {
  const mimeType = MIME_BY_EXT[extname(path).toLowerCase()] ?? "audio/webm";
  const audioBase64 = readFileSync(path).toString("base64");
  const payload = buildGeminiTranscriptionPayload(audioBase64, { mimeType, languageCode: "ja" });
  const url = `https://${host}/v1/projects/${projectId}/locations/${VERTEX_LOCATION}/publishers/google/models/${AUDIO_MODEL}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  const text = response.ok ? JSON.parse(body).candidates?.[0]?.content?.parts?.[0]?.text : undefined;
  check("audio (native generateContent)", response.ok && Boolean(text), `${response.status} ${String(text ?? body).slice(0, 80)}`);
}

async function main() {
  await verifyTextModel();
  if (audioPath) {
    await verifyAudioModel(audioPath);
  } else {
    console.log("SKIP  audio: pass --audio <file> to verify transcription");
  }

  if (failures > 0) process.exit(1);
}

void main();
