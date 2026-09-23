# pleno-live

Expo + tRPC ボイスメモアプリ

## Entry Points
- Client: `app/_layout.tsx`
- Server: `apps/server/_core/index.ts`

## Structure
```
app/               # Expo Router pages
  (tabs)/          # Tab navigation (record, notes, settings)
  note/[id]        # Note detail
apps/server/       # tRPC backend
  _core/           # Framework (trpc, llm, auth, context)
  routers.ts       # 全ルート定義 (auth.*, ai.*)
packages/
  components/      # UI components
  hooks/           # React hooks
  lib/             # Client utilities
  types/           # Type definitions
  constants/       # Constants
  platform/        # OS抽象化レイヤー (後述)
  infra/           # CodeBuild runner イメージ (AWS/GCP の IaC は iac-aws / iac-gcp で管理)
```

## Tech Stack
- Expo 54 + React Native 0.81, tRPC 11 + Express
- ElevenLabs STT, Gemini AI, Drizzle ORM, NativeWind + Tailwind

## File Index by Topic

### Recording (録音・波形・メータリング)
- `app/(tabs)/record.tsx`
- `packages/lib/recording-session-context.tsx` — expo-audioとExpoPlayAudioStreamを統合・調停
- `packages/hooks/use-background-recording.ts`, `use-recording-draft.ts`
- `packages/platform/audio-metering/` — expo-audioによる音量メータリング
- `packages/platform/audio-stream/` — @mykin-ai/expo-audio-stream (ExpoPlayAudioStream)
- `packages/lib/recordings-context.tsx`
- 注意: expo-audioとExpoPlayAudioStreamはマイク排他アクセス競合する

### Transcription (文字起こし)
- `packages/hooks/use-realtime-transcription.ts`
- `packages/lib/realtime-client.ts` — プロバイダ非依存のクライアント契約 + トークンパス
- `packages/lib/realtime-transcription-factory.ts` — プロバイダ別実装の切り替え
- `packages/lib/realtime-transcription.ts` — ElevenLabs Scribe Realtime v2
- `packages/lib/openai-realtime-transcription.ts` — OpenAI GPT Live Transcribe
- `packages/lib/pcm-resample.ts` — 16kHz→24kHz変換 (OpenAIは24kHz固定)
- `packages/types/realtime-transcription.ts` — TranscriptSegment型
- `apps/server/elevenlabs.ts`, `elevenlabs-realtime.ts`, `openai-realtime.ts`, `gemini.ts`
- `apps/server/realtime-token.ts` — トークン発行のレート制限 (両プロバイダ共通)
- `packages/lib/settings-context.tsx` — STTプロバイダ設定
- リアルタイムのプロバイダ設定 (`realtimeTranscription.provider`) は
  録音後のバッチ文字起こし設定 (`transcriptionProvider`) とは独立
- サーバー環境変数: `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`

## Platform Abstraction (`packages/platform/`)

各モジュールは `{name}.ts` + `{name}.native.ts` + `{name}.web.ts` + `index.ts` の構成:
`audio-metering/`, `audio-stream/`, `attestation/`, `background-task/`, `filesystem/`, `haptics/`, `permissions/`, `storage/`

## CI / Build Flow

環境変数は `eas.json` を単一ソースとして管理:
```yaml
run: jq -r '.build.PROFILE.env | to_entries[] | "\(.key)=\(.value)"' eas.json >> $GITHUB_ENV
```
- Preview APK: `.github/workflows/preview-apk.yml` (main push → prerelease)
- Release APK: `.github/workflows/release.yml` (version tag `v*` push → 正式リリース)
- iOS: Xcode Cloud (main push → TestFlight)。`ios/ci_scripts/ci_post_clone.sh` がprebuildを実行。署名はクラウドマネージド、env varsはWorkflow設定側で管理 (eas.jsonのjq読み込み対象外)
