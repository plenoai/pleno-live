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
  infra/           # Terraform IaC
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
- `packages/lib/realtime-transcription.ts`
- `packages/types/realtime-transcription.ts` — TranscriptSegment型
- `apps/server/elevenlabs.ts`, `elevenlabs-realtime.ts`, `gemini.ts`
- `packages/lib/settings-context.tsx` — STTプロバイダ設定

### Auth (HMAC Challenge-Response)
- Client: `packages/lib/auth.ts` (expo-crypto), `packages/lib/trpc.ts`
- Server: `apps/server/attestation.ts`, `apps/server/_core/auth.ts`
- Platform: `packages/platform/attestation/`

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
