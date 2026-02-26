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

# Publish Guide

`/release` スキルを使用してリリースを実行します。

## 概要
- EAS Cloudは明示されない限り使用しない
- ローカルでAPKビルドし `gh release` で公開
- ダウンロードQR画像を生成しREADMEを更新

## Android SDK
```bash
# Homebrew SDK パス
sdk.dir=/opt/homebrew/share/android-commandlinetools
```

## ビルドコマンド
```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
# 出力: android/app/build/outputs/apk/release/app-release.apk
```

# CI / Preview Build

## Preview APK (`.github/workflows/preview-apk.yml`)

- **トリガー**: `canary`ブランチへのpush、または `workflow_dispatch`
- **ランナー**: `ubuntu-latest`（Android SDK焼き込み済みAMI、約6分で完了）
- **最適化**: `arm64-v8a`のみビルド・R8 minify有効・lint無効・Gradleキャッシュ
- **成果物**: GitHub Releases に `preview-{SHORT_SHA}` タグでprerelease作成
- **固定URL**: `https://github.com/HikaruEgashira/pleno-live/releases/latest/download/pleno-live-latest.apk`
- **古いリリース自動削除**: 最新5件を残してクリーンアップ

## Runner Image (`.github/workflows/build-runner-image.yml`)

- **トリガー**: `packages/infra/runner.Dockerfile` 変更時
- **内容**: Ubuntu 22.04 + Android SDK 34 のカスタムイメージをECRにプッシュ
- **認証**: GitHub OIDC → AWS IAM Role `pleno-live-github-actions`（アクセスキー不要）
- **用途**: CodeBuild Runner用（現在は未使用。ubuntu-latestの方が高速なため）

## AWS CodeBuild Runner（待機中）

`packages/infra/codebuild-runner.tf` でTerraform管理。
現在は **ubuntu-latestの方が速い（6m vs 15m）** ため無効。
ビルドが大型化して並列処理やメモリ増強が必要になった場合に活用を検討する。
