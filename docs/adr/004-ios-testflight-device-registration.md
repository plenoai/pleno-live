# ADR 004: Xcode Cloud の ad-hoc/development エクスポート失敗への対応

## ステータス
承認済み

## コンテキスト
iOS は Xcode Cloud (Archive - iOS / TestFlight Internal Testing 配布) で
ビルド・配信している。SDK 56 リグレッション (PR #213) を解消した後も、
app-store エクスポートまでは成功する一方、**ad-hoc / development
エクスポートが exit 70 で失敗**し、Archive Action 全体が失敗扱いとなって
TestFlight にビルドが反映されなかった。

原因は Apple Developer チームの**登録デバイスが 0 台**であったこと。
Apple は development / ad-hoc プロビジョニングプロファイルの作成に登録
デバイスを要求する。Xcode Cloud は ad-hoc / development エクスポートを
無効化するオプションを提供しておらず、App Store Connect API アクセスの
有効化では解消しなかった。

- 参考: <https://developer.apple.com/forums/thread/710401>

## 決定
Xcode Cloud の設定では回避できないため、**登録デバイスを 1 台以上保つのを
運用上の前提とする**。その管理を手作業に依存させないため、
`scripts/register-ios-device.mjs` を追加する。

- App Store Connect API (`/v1/devices`) でデバイスを一覧・登録する CLI。
- 依存を増やさないよう Node 標準の `crypto` だけで ES256 JWT を生成する。
- `--check` は登録デバイスが 0 台なら非ゼロ終了し、CI で早期に検知できる。
- 既存 UDID の再登録 (409 Conflict) は冪等に扱う。
- `ios/ci_scripts/ci_post_clone.sh` は ASC 認証情報が Workflow 環境に
  ある場合のみ `--check` を実行し、0 台を早期に警告する (点検自体の失敗で
  ビルドは止めない)。

### 使い方
```bash
# 環境変数: ASC_KEY_ID / ASC_ISSUER_ID / (ASC_PRIVATE_KEY | ASC_PRIVATE_KEY_PATH)
node scripts/register-ios-device.mjs --list
node scripts/register-ios-device.mjs --register --udid <UDID> --name "My iPhone"
node scripts/register-ios-device.mjs --check
```

## 結果
- TestFlight 配信が「登録デバイス 0 台」でブロックされなくなる。
- デバイス登録がスクリプト化され、再現・監査できる。

## 補足
- TestFlight 内部テスターグループの作成は本 ADR のスコープ外 (フォローアップ)。
- Apple Developer 画面での手動登録も引き続き可能
  (<https://developer.apple.com/account/resources/devices/list>)。
