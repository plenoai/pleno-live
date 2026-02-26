import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/packages/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/packages/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient, createVanillaTRPCClient } from "@/packages/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/packages/lib/_core/manus-runtime";
import { RecordingsProvider } from "@/packages/lib/recordings-context";
import { LanguageProvider } from "@/packages/lib/i18n/context";
import { SettingsProvider } from "@/packages/lib/settings-context";
import { initializeAuth, setTRPCClient } from "@/packages/lib/auth";

const STORYBOOK_ENABLED = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === "true";

function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const vanillaClient = createVanillaTRPCClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTRPCClient(vanillaClient as any);
    initializeAuth().finally(() => setAuthReady(true));
  }, []);

  if (!authReady) return null;

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <LanguageProvider>
            <RecordingsProvider>{children}</RecordingsProvider>
          </LanguageProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </trpc.Provider>
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
  // ウェブでもAppProvidersを常に使用（tRPCコンテキストが必要なため）
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      {stack}
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  ) : (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProviders>
        {stack}
        <StatusBar style="auto" />
      </AppProviders>
    </GestureHandlerRootView>
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
