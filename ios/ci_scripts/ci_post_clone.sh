#!/bin/bash
# Xcode Cloudがクローン直後に実行するフック (ファイル名・配置はApple規約)。
# CNG構成のためios/はこのci_scripts以外未コミット。ここでネイティブプロジェクトを生成する。
#
# App Store Connect側の初期設定 (1回のみ):
#   1. ローカルで `pnpm exec expo prebuild --platform ios` 後、Xcodeでios/PlenoLive.xcworkspaceを開く
#   2. Report Navigator > Cloud タブ > Create Workflow で本リポジトリ(GitHub)を接続
#   3. Workflow: Branch Changes = main / Archive - iOS / TestFlight (Internal Testing) 配布
#   4. 署名はXcode Cloudのクラウドマネージド署名 (証明書・プロファイルの手動管理は不要)
#   5. Workflow > Environment に EXPO_PUBLIC_API_URL を設定
#   6. Apple Developer チームにiOSデバイスを1台以上登録する (下記「登録デバイス」参照)
#
# 登録デバイス (必須):
#   Xcode CloudのArchive Actionはapp-storeに加えてad-hoc/developmentエクスポートも
#   実行する。Appleはdevelopment/ad-hocプロビジョニングプロファイルの作成に登録
#   デバイスを要求するため、チームの登録デバイスが0台だと `xcodebuild -exportArchive`
#   が exit 70で失敗し、Archive Action全体が失敗扱いになってTestFlightにビルドが
#   届かない。Xcode Cloudには無効化する設定が無いので、1台以上登録しておく。
#     取得: MacのFinder → iPhone → シリアル番号表示をクリック → 右クリックでコピー
#     登録: scripts/register-ios-device.mjs --register --udid <UDID> --name "<NAME>"
#   Workflow > Environment に ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY を
#   設定しておくと、下の事前点検が0台を検知して早期に警告する。
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

# pod installはprebuildが実行する。ios/にci_scriptsしか無い状態ではprebuildが
# malformed判定でios/を再生成しci_scriptsを消すため復元する (実行中の本体はfd保持で完走する)
pnpm exec expo prebuild --platform ios
git checkout -- ios/ci_scripts

# Xcodeビルドフェーズはbrew PATHを継承しないため、nodeの絶対パスを明示する
echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local

# 登録デバイスが0台だとアーカイブ後のad-hoc/developmentエクスポートが exit 70で
# 失敗する。ASC APIの認証情報がWorkflow環境にあれば事前に点検し、失敗を早期に
# 可視化する (点検自体の失敗でビルドは止めない)。
if [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then
  node scripts/register-ios-device.mjs --check || \
    echo "⚠️  登録デバイスの点検に失敗しました。Xcode CloudのArchiveが exit 70で失敗する可能性があります。" >&2
fi
