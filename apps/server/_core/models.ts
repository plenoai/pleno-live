/**
 * Vertex AI Gemini のモデルと配置の単一情報源。
 *
 * - Gemini 2.5 系は 2026-10-16 に廃止されるため Gemini 3.x を使用する。
 * - Gemini 3.x は本プロジェクトでは location "global" でのみ提供される
 *   （us-central1 等のリージョナルエンドポイントでは 404）。
 * - モデル更新時はこのファイルだけを変更する。
 */

export const VERTEX_LOCATION = "global";

/** OpenAI 互換エンドポイントで使うテキスト生成モデル。 */
export const TEXT_MODEL = "gemini-3.1-flash-lite";

/** 音声文字起こしモデル。 */
export const AUDIO_MODEL = "gemini-3.1-flash-lite";

/**
 * Vertex AI のエンドポイントホスト名。
 * location "global" はリージョン接頭辞を持たない。
 */
export const vertexHost = (location: string = VERTEX_LOCATION): string =>
  location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
