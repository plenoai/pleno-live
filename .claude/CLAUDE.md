# pleno-live

Expo + tRPC ボイスメモアプリ

## Entry Points
- Client: `app/_layout.tsx`
- Server: `apps/server/_core/index.ts`

## Structure
```
app/               # Expo Router pages (クライアント)
  (tabs)/          # Tab navigation (record, index, settings)
  note/[id]        # Note detail
apps/              # 実行可能アプリケーション
  server/          # tRPC backend
    _core/         # Framework (trpc, llm)
    routers.ts     # API routes
packages/          # 共有ライブラリ
  components/      # UI components
  hooks/           # React hooks
  lib/             # Client utilities
  types/           # Type definitions
  constants/       # Constants
  infra/           # Terraform IaC
```

## Tech Stack
- Expo 54 + React Native 0.81
- tRPC 11 + Express
- ElevenLabs STT, Gemini AI

# CI / Build Flow

## 環境変数管理

`eas.json` を単一ソースとして管理し、CI は `jq` で読み取る:
```yaml
- name: Load env from eas.json
  run: jq -r '.build.PROFILE.env | to_entries[] | "\(.key)=\(.value)"' eas.json >> $GITHUB_ENV
```
- `preview` プロファイル → `preview-apk.yml`
- `production` プロファイル → `release.yml`

## Preview APK (`.github/workflows/preview-apk.yml`)

- **トリガー**: `canary`ブランチへのpush、または `workflow_dispatch`
- **ランナー**: `ubuntu-latest`（約6分で完了）
- **最適化**: `arm64-v8a`のみビルド・R8 minify有効・lint無効・Gradleキャッシュ
- **成果物**: GitHub Releases に `preview-{SHORT_SHA}` タグでprerelease作成
- **固定URL**: `https://github.com/HikaruEgashira/pleno-live/releases/latest/download/pleno-live-latest.apk`
- **古いリリース自動削除**: 最新5件を残してクリーンアップ

## Release APK (`.github/workflows/release.yml`)

- **トリガー**: `main`ブランチへのpush（website変更除く）
- **ランナー**: `ubuntu-latest`
- **成果物**: GitHub Releases に `v{VERSION}-{SHORT_SHA}` タグで正式リリース作成・APK添付
- **古いリリース自動削除**: 最新10件を残してクリーンアップ
