import { useEffect, useRef, useState } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Platform,
} from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { SystemAudioStream, AudioSource } from "@/packages/lib/system-audio-stream";

import { ScreenContainer } from "@/packages/components/screen-container";
import { PageHeader } from "@/packages/components/page-header";
import { IconSymbol, type IconSymbolName } from "@/packages/components/ui/icon-symbol";
import { Badge } from "@/packages/components/ui/badge";
import { useColors } from "@/packages/hooks/use-colors";
import { useResponsive } from "@/packages/hooks/use-responsive";
import { useRecordingSession } from "@/packages/lib/recording-session-context";
import { useTranslation } from "@/packages/lib/i18n/context";
import { useTranscriptRefinement } from "@/packages/hooks/use-transcript-refinement";
import { withAlpha } from "@/packages/lib/color";
import {
  BorderRadius,
  FontSize,
  FontWeight,
  ScreenPadding,
  Spacing,
} from "@/packages/constants/layout";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

const AUDIO_SOURCE_ICONS: Record<AudioSource, IconSymbolName> = {
  microphone: "mic.fill",
  system: "display",
  both: "waveform",
};

export default function RecordScreen() {
  const colors = useColors();
  const { isDesktop, width: screenWidth } = useResponsive();
  // Dynamic waveform bar count: 6px bar width + 2px gap = 8px per bar, with 32px padding
  const waveformBarCount = Math.floor((screenWidth - 72) / 8);
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const [audioSource, setAudioSource] = useState<AudioSource>("microphone");
  const isSystemAudioSupported = Platform.OS === "web" && SystemAudioStream.isSupported();

  const AUDIO_SOURCE_OPTIONS: { key: AudioSource; label: string; icon: string }[] = [
    { key: "microphone", label: t("record.microphone"), icon: AUDIO_SOURCE_ICONS.microphone },
    { key: "system", label: t("record.systemAudio"), icon: AUDIO_SOURCE_ICONS.system },
    { key: "both", label: t("record.both"), icon: AUDIO_SOURCE_ICONS.both },
  ];

  const {
    state,
    pulseAnim,
    realtimeState,
    mergedSegments: rawMergedSegments,
    getTranslation,
    getTranslationStatus,
    isTranslating,
    startRecording,
  } = useRecordingSession();

  const mergedSegments = useTranscriptRefinement(rawMergedSegments);

  const {
    isRecording,
    isPaused,
    duration,
    realtimeEnabled,
    translationEnabled,
    meteringHistory,
  } = state;

  // Keep screen awake during recording
  useKeepAwake();

  // Auto-scroll realtime transcript
  useEffect(() => {
    if (realtimeState.segments.length > 0 && scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [realtimeState.segments]);

  return (
    <ScreenContainer>
      <View style={[styles.container, isDesktop && styles.containerDesktop]}>
        <PageHeader
          title={isRecording ? t("record.title_recording") : t("record.title_new")}
          horizontalPadding={isDesktop ? 40 : undefined}
          action={
            isRecording ? (
              <View style={styles.recordingIndicator}>
                <Animated.View
                  style={[
                    styles.recordingDot,
                    { backgroundColor: colors.recording, transform: [{ scale: pulseAnim }] },
                  ]}
                />
                <Text style={[styles.recordingText, { color: colors.recording }]}>REC</Text>
              </View>
            ) : undefined
          }
        />

        <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        {/* Audio Source Selector (Web only) */}
        {isSystemAudioSupported && !isRecording && (
          <View style={styles.audioSourceContainer}>
            <Text style={[styles.audioSourceLabel, { color: colors.muted }]}>
              音声ソース
            </Text>
            <View style={[styles.audioSourceSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {AUDIO_SOURCE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setAudioSource(option.key)}
                  style={[
                    styles.audioSourceOption,
                    audioSource === option.key && {
                      backgroundColor: colors.primary,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    name={option.icon}
                    size={16}
                    color={audioSource === option.key ? "#FFFFFF" : colors.muted}
                  />
                  <Text
                    style={[
                      styles.audioSourceText,
                      {
                        color: audioSource === option.key ? "#FFFFFF" : colors.foreground,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {audioSource !== "microphone" && (
              <Text style={[styles.audioSourceHint, { color: colors.muted }]}>
                録音開始時に画面共有ダイアログが表示されます
              </Text>
            )}
          </View>
        )}

        {/* Timer */}
        <View style={styles.timerContainer}>
          <Text style={[styles.timer, { color: colors.foreground }]}>{formatTime(duration)}</Text>
        </View>

        {/* Waveform */}
        <View style={[styles.waveform, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
          <View style={styles.waveformBars}>
            {Array.from({ length: waveformBarCount }).map((_, i) => {
              const metering = meteringHistory[i] ?? -160;
              // -30dB〜0dBを0〜1にマッピング、pow(1.3)でコントラスト強調
              const value = Math.max(0, Math.min(1, (metering + 30) / 30));
              const normalizedHeight = Math.pow(value, 1.3);
              const barHeight = isRecording && !isPaused ? 8 + normalizedHeight * 52 : 20;
              return (
                <View
                  key={i}
                  style={[
                    styles.waveformBar,
                    {
                      backgroundColor: isRecording && !isPaused ? colors.primary : colors.muted,
                      height: barHeight,
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>

        {/* Realtime Transcription */}
        {isRecording && realtimeEnabled && (
          <View style={[styles.realtimeSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.realtimeHeader}>
              <View style={styles.realtimeHeaderLeft}>
                <IconSymbol name="text.bubble" size={16} color={colors.primary} />
                <Text style={[styles.realtimeTitle, { color: colors.foreground }]}>
                  {t("record.realtimeTranscription")}
                </Text>
                {translationEnabled && isTranslating && (
                  <Badge variant="primary" size="sm">
                    {t("record.translating")}
                  </Badge>
                )}
              </View>
              <View style={styles.realtimeStatus}>
                {realtimeState.connectionStatus === "connected" && (
                  <>
                    <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                    <Text style={[styles.statusText, { color: colors.success }]}>{t("record.connected")}</Text>
                  </>
                )}
                {realtimeState.connectionStatus === "connecting" && (
                  <>
                    <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
                    <Text style={[styles.statusText, { color: colors.warning }]}>{t("record.connecting")}</Text>
                  </>
                )}
                {realtimeState.connectionStatus === "disconnected" && (
                  <>
                    <View style={[styles.statusDot, { backgroundColor: colors.muted }]} />
                    <Text style={[styles.statusText, { color: colors.muted }]}>{t("record.disconnected")}</Text>
                  </>
                )}
                {realtimeState.connectionStatus === "error" && (
                  <>
                    <View style={[styles.statusDot, { backgroundColor: colors.error }]} />
                    <Text style={[styles.statusText, { color: colors.error }]}>{t("common.error")}</Text>
                  </>
                )}
              </View>
            </View>
            <ScrollView
              ref={scrollViewRef}
              style={styles.realtimeContent}
              showsVerticalScrollIndicator={true}
            >
              {realtimeState.error && (
                <Text style={[styles.realtimePlaceholder, { color: colors.error }]}>
                  エラー: {realtimeState.error}
                </Text>
              )}
              {!realtimeState.error && realtimeState.segments.length === 0 ? (
                <Text style={[styles.realtimePlaceholder, { color: colors.muted }]}>
                  話し始めると、ここに文字起こし結果が表示されます...
                </Text>
              ) : (
                mergedSegments
                .filter((segment, index) =>
                  !segment.isPartial || index === mergedSegments.length - 1
                )
                .map((segment) => {
                  const translation = translationEnabled ? getTranslation(segment.id) : undefined;
                  const translationStatus = translationEnabled ? getTranslationStatus(segment.id) : undefined;

                  return (
                    <View key={segment.id} style={styles.segmentItem}>
                      {segment.speaker && (
                        <Text style={[styles.speakerLabel, { color: colors.secondary }]}>
                          [{segment.speaker}]
                        </Text>
                      )}
                      {/* 並列表示レイアウト */}
                      <View style={translationEnabled ? styles.segmentRow : undefined}>
                        {/* 元テキスト */}
                        <View style={translationEnabled ? styles.segmentColumn : undefined}>
                          <Text
                            style={[
                              styles.segmentText,
                              {
                                color: segment.isPartial ? colors.muted : colors.foreground,
                                fontStyle: segment.isPartial ? "italic" : "normal",
                              },
                            ]}
                          >
                            {segment.text}
                          </Text>
                        </View>
                        {/* 翻訳テキスト */}
                        {translationEnabled && (
                          <View style={[styles.segmentColumn, styles.translationColumn, { borderLeftColor: colors.border }]}>
                            {translationStatus === "pending" ? (
                              <Text style={[styles.translationPending, { color: colors.muted }]}>
                                翻訳中...
                              </Text>
                            ) : translationStatus === "error" ? (
                              <Text style={[styles.translationError, { color: colors.error }]}>
                                翻訳エラー
                              </Text>
                            ) : translation ? (
                              <Text
                                style={[
                                  styles.segmentText,
                                  {
                                    color: segment.isPartial ? withAlpha(colors.primary, 0.6) : colors.primary,
                                    fontStyle: segment.isPartial ? "italic" : "normal",
                                  },
                                ]}
                              >
                                {translation}
                              </Text>
                            ) : null}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}

        {/* Controls - Not recording: centered */}
        {!isRecording && (
          <View style={styles.controls}>
            <TouchableOpacity
              onPress={() => startRecording(audioSource)}
              style={[styles.recordButton, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <IconSymbol name="mic.fill" size={40} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={[styles.instructions, { color: colors.muted }]}>
              {t("record.instructions")}
            </Text>
          </View>
        )}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 72,
  },
  containerDesktop: {
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  body: {
    flex: 1,
    paddingHorizontal: ScreenPadding.horizontal,
  },
  bodyDesktop: {
    paddingHorizontal: 40,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: BorderRadius.sm + 1,
  },
  recordingText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  audioSourceContainer: {
    marginBottom: Spacing.sm,
  },
  audioSourceLabel: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  audioSourceSelector: {
    flexDirection: "row",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: 4,
  },
  audioSourceOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.lg,
  },
  audioSourceText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  audioSourceHint: {
    fontSize: 11,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  timerContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xxxl,
  },
  timer: {
    fontSize: FontSize.timer,
    fontWeight: "300",
    fontVariant: ["tabular-nums"],
  },
  waveform: {
    height: 120,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    justifyContent: "center",
  },
  waveformBars: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: "100%",
  },
  waveformBar: {
    width: 3,
    borderRadius: BorderRadius.xs,
  },
  controls: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xxl,
  },
  recordButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  instructions: {
    textAlign: "center",
    fontSize: FontSize.md,
  },
  realtimeSection: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    flex: 1,
  },
  realtimeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  realtimeHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  realtimeTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  realtimeStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: BorderRadius.sm - 1,
  },
  statusText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  realtimeContent: {
    flex: 1,
  },
  realtimePlaceholder: {
    fontSize: FontSize.base,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: Spacing.xl,
  },
  segmentItem: {
    marginBottom: Spacing.sm,
  },
  speakerLabel: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    marginBottom: 2,
  },
  segmentText: {
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  segmentRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  segmentColumn: {
    flex: 1,
  },
  translationColumn: {
    borderLeftWidth: 2,
    paddingLeft: Spacing.md,
  },
  translationPending: {
    fontSize: FontSize.sm,
    fontStyle: "italic",
  },
  translationError: {
    fontSize: FontSize.sm,
  },
});
