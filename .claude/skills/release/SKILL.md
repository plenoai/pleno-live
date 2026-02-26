---
name: release
description: バージョンバンプPRを作成し、CIでAPKビルド＋GitHubリリースを自動作成する
---

# Release Skill

バージョンをバンプするPRをmainにマージすることで、GitHub Actions（`.github/workflows/release.yml`）がAPKビルドとリリース作成を自動実行します。

## 手順

### 1. バージョン確認と更新

```bash
# 現在のバージョンと最新リリースを確認
node -p "require('./package.json').version"
gh release list --limit 5

# 適切なバージョンに更新 (patch/minor/major)
npm version <new-version> --no-git-tag-version
```

### 2. PRを作成してマージ

```bash
VERSION=$(node -p "require('./package.json').version")

git checkout -b release/v${VERSION}
git add package.json
git commit -m "chore: bump version to ${VERSION}"
git push -u origin release/v${VERSION}
gh pr create --title "chore: bump version to ${VERSION}" --body "Release preparation"
gh pr merge --squash --delete-branch
```

### 3. CIの確認

mainへのマージ後、`release.yml`が自動トリガーされる。

```bash
# CIの実行状況を確認
gh run list --limit 3
gh run watch <run-id>
```

CIが実行する内容:
- pnpm install + 型チェック
- `eas.json`のproductionプロファイルから環境変数をロード
- Expo prebuild + Gradle APKビルド（arm64-v8a, R8 minify）
- `v{VERSION}-{SHORT_SHA}` タグでGitHub Releaseを作成しAPKを添付
- 同一バージョンの古いリリースを10件残してクリーンアップ

## 注意事項

- ローカルでAPKビルドは行わない（CIに任せる）
- mainブランチは保護されているため、PRでマージする
- EAS Cloudは明示されない限り使用しない
