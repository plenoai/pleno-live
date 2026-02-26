// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";
import reactNativePlugin from "eslint-plugin-react-native";

export default defineConfig([
  expoConfig,
  {
    plugins: {
      "react-native": reactNativePlugin,
    },
    rules: {
      // StyleSheet定義で未使用スタイルを検出
      "react-native/no-unused-styles": "error",
      // デバッグログの本番混入を防止（console.warn/error は許可）
      "no-console": ["error", { allow: ["warn", "error"] }],
      // any型の使用を禁止
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    ignores: ["dist/*"],
  },
]);
