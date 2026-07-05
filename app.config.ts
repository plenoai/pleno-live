import type { ExpoConfig } from "expo/config";
import pkg from "./package.json";

// plenoai.comのreverse-DNS。変更するとiOS/Android両方で別アプリ扱いになる
const bundleId = "com.plenoai.plenolive";

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "Pleno Live",
  appSlug: "pleno-live",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310419663029883783/JctVFWQukIJdYlBY.png",
  scheme: "plenolive",
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: pkg.version,
  owner: "hikae",
  extra: {
    eas: {
      projectId: "a4f0e87b-1f9a-48d7-a813-94d61f5bc29a",
    },
  },
  updates: {
    url: "https://u.expo.dev/a4f0e87b-1f9a-48d7-a813-94d61f5bc29a",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      UIBackgroundModes: ["audio"],
      NSMicrophoneUsageDescription: "音声録音のためにマイクへのアクセスが必要です。",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: [
      "POST_NOTIFICATIONS",
      "RECORD_AUDIO",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_MICROPHONE",
    ],
    intentFilters: [
      {
        action: "VIEW",
        data: [
          {
            scheme: env.scheme,
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "@react-native-community/datetimepicker",
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
        enableBackgroundAudio: true,
      },
    ],
    "@mykin-ai/expo-audio-stream",
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          extraProguardRules: "-dontwarn expo.modules.kotlin.runtime.Runtime",
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    baseUrl: "/pleno-live",
  },
};

export default config;
