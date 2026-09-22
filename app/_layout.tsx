import "@/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, View } from "react-native";
import "@/packages/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/packages/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { initManusRuntime, subscribeSafeAreaInsets } from "@/packages/lib/_core/manus-runtime";
import { RecordingsProvider } from "@/packages/lib/recordings-context";
import { LanguageProvider } from "@/packages/lib/i18n/context";
import { SettingsProvider } from "@/packages/lib/settings-context";

const STORYBOOK_ENABLED = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === "true";

function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <LanguageProvider>
        <RecordingsProvider>{children}</RecordingsProvider>
      </LanguageProvider>
    </SettingsProvider>
  );
}

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StorybookUI = STORYBOOK_ENABLED ? require("../.rnstorybook").default : null;

function AppLayout() {
  // ウェブでもAppProvidersを常に使用
  const isWebLanding = false;

  // Use fixed initial values to avoid hydration mismatch (SSR vs client)
  const [insets, setInsets] = useState<EdgeInsets>(DEFAULT_WEB_INSETS);
  const [frame, setFrame] = useState<Rect>(DEFAULT_WEB_FRAME);

  // Apply actual metrics after mount
  useEffect(() => {
    if (initialWindowMetrics) {
      setInsets(initialWindowMetrics.insets);
      setFrame(initialWindowMetrics.frame);
    }
  }, []);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    if (!isWebLanding) {
      initManusRuntime();
    }
  }, [isWebLanding]);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || isWebLanding) return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate, isWebLanding]);

  // Ensure minimum padding for top and bottom - use fixed values to avoid hydration mismatch
  const providerInitialMetrics = useMemo(() => {
    return {
      insets: {
        ...DEFAULT_WEB_INSETS,
        top: Math.max(insets.top, 16),
        bottom: Math.max(insets.bottom, 12),
      },
      frame,
    };
  }, [insets, frame]);

  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="note/[id]" options={{ presentation: "card" }} />
    </Stack>
  );

  // ウェブのランディングページではAppProvidersをスキップ（音声許可を求めない）
  const content = isWebLanding ? (
    <View style={{ flex: 1 }}>
      {stack}
      <StatusBar style="dark" />
    </View>
  ) : (
    <View style={{ flex: 1 }}>
      <AppProviders>
        {stack}
        <StatusBar style="auto" />
      </AppProviders>
    </View>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}

export default StorybookUI ?? AppLayout;
