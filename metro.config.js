const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const withStorybook = require("@storybook/react-native/metro/withStorybook");
const path = require("path");

const config = getDefaultConfig(__dirname);

// onnxruntime-web の ESM ビルド (import(/*webpackIgnore*/e)) は Metro 非対応。
// package.json exports の "require" 条件 (CJS/UMD) にリダイレクトして解決する。
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "onnxruntime-web") {
    return {
      filePath: path.resolve(__dirname, "node_modules/onnxruntime-web/dist/ort.min.js"),
      type: "sourceFile",
    };
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
