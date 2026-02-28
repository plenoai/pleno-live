const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const withStorybook = require("@storybook/react-native/metro/withStorybook");
const path = require("path");

const config = getDefaultConfig(__dirname);

// onnxruntime-web の全ビルド (CJS/ESM 共に) に Metro 非対応の import() が含まれる。
// web ビルド時は空モジュールとして解決し、バンドル解析エラーを回避する。
// ランタイムエラーは use-moonshine-model.web.ts の catch でハンドリングされる。
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "onnxruntime-web") {
    return { type: "empty" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// モバイルビルドではwebsiteディレクトリを除外して軽量化
const isWeb = process.env.EXPO_OS === "web" || process.argv.includes("--platform=web");
if (!isWeb) {
  config.resolver.blockList = [
    ...(config.resolver.blockList || []),
    new RegExp(path.join(__dirname, "app", "website").replace(/\\/g, "\\\\") + ".*"),
  ];
}

// NativeWindを適用
const nativeWindConfig = withNativeWind(config, {
  input: "./global.css",
});

// Storybookを適用（環境変数で有効化）
module.exports = withStorybook(nativeWindConfig, {
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === "true",
  configPath: "./.rnstorybook",
});
