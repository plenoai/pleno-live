# Gemini 2.5 → 3.x 移行

## 背景

Gemini 2.5 系（`gemini-2.5-flash` / `gemini-2.5-flash-lite`）は 2026-10-16 に廃止される。
pleno-live は両モデルを Vertex AI 経由で使用しているため、Gemini 3.x へ移行する。

## 利用箇所

| 用途 | 呼び出し元 | 旧モデル | 備考 |
| --- | --- | --- | --- |
| テキスト生成（要約・タグ・感情・キーワード・アクションアイテム・翻訳・Q&A・文字起こし校正） | `invokeLLM()` (`apps/server/_core/llm.ts`) ← `apps/server/routers.ts` の `ai.*` 9箇所 | `google/gemini-2.5-flash-lite` | リアルタイム文字起こしの校正は `packages/hooks/use-transcript-refinement.ts` から committed 3件ごとに呼ばれる |
| 音声文字起こし | `transcribeAudioWithGemini()` (`apps/server/gemini.ts`) ← `ai.transcribe`（provider=gemini 時） | `gemini-2.5-flash` | `ai.transcribe` のデフォルト provider は elevenlabs |

旧バージョンのモデルIDはハードコードされており、更新のたびに複数ファイルを触る必要があった。
今回 `apps/server/_core/models.ts` に集約した。

## 判明した制約

1. **Gemini 3.x は location `global` でのみ提供される。**
   本プロジェクトでは `us-central1` / `us-east5` のリージョナルエンドポイントは 404 になる。
   `GCP_REGION`（デフォルト `us-central1`）のままでは呼べないため、モデル呼び出しは `global` 固定にした。
2. **Vertex AI の `v1` `generateContent` は `role` が必須。**
   旧 AI Studio (`generativelanguage.googleapis.com/v1beta`) から Vertex へ移行したコミットで `role` が抜け、
   音声文字起こしが 400 (`Please use a valid role: user, model.`) になっていた。今回修正した。
   この不具合は自動テストが無く検知できていなかった（互換性テストを追加して再発を防ぐ）。

## 選定モデルと料金

`gemini-3.1-flash-lite` を採用（テキスト・音声とも）。Gemini 3 系で最安。

| 用途 | 旧 | 旧 料金 /1M (in / out) | 新 | 新 料金 /1M (in / out) |
| --- | --- | --- | --- | --- |
| テキスト | `gemini-2.5-flash-lite` | $0.10 / $0.40 | `gemini-3.1-flash-lite` | $0.25 / $1.50 |
| 音声 | `gemini-2.5-flash` | $0.30 / $2.50 | `gemini-3.1-flash-lite` | $0.25 / $1.50 |

- テキストは値上げ（入力 2.5x / 出力 3.75x）。校正は呼び出し頻度が高いため、実運用のコストを監視する。
- 音声は値下げ。ただし品質は要検証（下記）。
- 品質優先の代替（`apps/server/_core/models.ts` の1行変更で切替可）:
  - `gemini-3.5-flash-lite` — $0.30 / $2.50。音声の英語サンプルでは 3.1 より自然。
  - `gemini-3.5-transcribe-preview` — 文字起こし専用。品質は最良だが preview のため非推奨。

## 互換性テスト

実 API を叩いて、本番と同じモデル・配置・リクエスト形状が通ることを確認する。

```sh
# テキストのみ
GCP_PROJECT_ID=pleno-live pnpm verify:vertex

# 音声も検証（webm/m4a/mp3/wav/aiff）
GCP_PROJECT_ID=pleno-live pnpm verify:vertex --audio ./sample.webm
```

- 認証は `GOOGLE_ACCESS_TOKEN`、無ければ `gcloud auth print-access-token` を使用。
- 実コード（`models.ts` の定数と `buildGeminiTranscriptionPayload`）を import するため、形状がドリフトしない。
- 課金と認証が必要なため CI では実行しない。CI では `tests/vertex-models.test.ts` が
  host 解決・location・モデル名・`role` の有無を検証する。

確認済み（2026-09-16, project `pleno-live`）:

```
PASS  text (OpenAI compat): 200 OK
PASS  audio (native generateContent): 200 [Speaker 1] こんにちは。これはプリノライブの文字起こし互換性テストです。明日の会議は午後3時からです。
```

## 移行手順

1. `apps/server/_core/models.ts` の `TEXT_MODEL` / `AUDIO_MODEL` を `gemini-3.1-flash-lite` に変更。
2. `llm.ts` / `gemini.ts` の URL を `global` ホストに変更、`gemini.ts` に `role: "user"` を追加。
3. `pnpm check && pnpm test`。
4. 実音声で `pnpm verify:vertex --audio` と、日本語の実録音で文字起こし品質を確認。
5. デプロイ後、`ai.*` と `ai.transcribe`（provider=gemini）の応答を本番で確認。

## ロールバック

`apps/server/_core/models.ts` の2定数を旧モデルに戻し、`VERTEX_LOCATION` を `us-central1` に戻す
（`gemini.ts` の `role` は残してよい）。ただし 2.5 は 2026-10-16 に停止するため恒久手段にはならない。

## 残課題

- 音声文字起こしの品質を実録音（日本語・英語・複数話者）で評価し、必要なら `gemini-3.5-flash-lite` へ切替。
- `GCP_REGION` はモデル呼び出しでは未使用になった。他用途が無ければ Terraform と `env.ts` から整理する。
