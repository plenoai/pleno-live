#!/bin/bash
# Xcode Cloudがクローン直後に実行するフック (ファイル名・配置はApple規約)。
# CNG構成のためios/はこのci_scripts以外未コミット。ここでネイティブプロジェクトを生成する。
#
# App Store Connect側の初期設定 (1回のみ):
#   1. ローカルで `pnpm exec expo prebuild --platform ios` 後、Xcodeでios/PlenoLive.xcworkspaceを開く
#   2. Report Navigator > Cloud タブ > Create Workflow で本リポジトリ(GitHub)を接続
#   3. Workflow: Branch Changes = main / Archive - iOS / TestFlight (Internal Testing) 配布
#   4. 署名はXcode Cloudのクラウドマネージド署名 (証明書・プロファイルの手動管理は不要)
#   5. Workflow > Environment に EXPO_PUBLIC_API_URL と EXPO_PUBLIC_APP_HMAC_SECRET (Secret) を設定
set -euo pipefail

# Xcode CloudはCI=TRUEを設定するが、getenvのboolean解析が大文字TRUEで落ちるため上書き
export CI=true
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# eas.jsonのnode 20系に合わせる。cocoapodsはXcode Cloudイメージに含まれないため必須
brew install node@20 cocoapods
brew link --force --overwrite node@20

cd "$CI_PRIMARY_REPOSITORY_PATH"

corepack enable
pnpm install --frozen-lockfile

# --cleanはci_scriptsごとios/を消すため使わない。pod installはprebuildが実行する
pnpm exec expo prebuild --platform ios

# Xcodeビルドフェーズはbrew PATHを継承しないため、nodeの絶対パスを明示する
echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local
