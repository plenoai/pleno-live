/**
 * リアルタイム文字起こしReactフック
 *
 * ElevenLabs Scribe Realtime V2を使用して、
 * 録音中にリアルタイムで文字起こし結果を取得します。
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Alert } from "react-native";
import { trpc } from "@/packages/lib/trpc";
import { RealtimeTranscriptionClient } from "@/packages/lib/realtime-transcription";
import { createAudioStream, type AudioStreamController, type AudioStreamResult } from "@/packages/platform";
import type {
  TranscriptSegment,
  RealtimeTranscriptionState,
  RealtimeOptions,
} from "@/packages/types/realtime-transcription";

/**
 * リアルタイム文字起こしのコールバック
 */
export interface RealtimeSessionCallbacks {
  /** partial（途中結果）イベント時に呼ばれる */
  onPartial?: (segment: TranscriptSegment) => void;
  /** committed（確定結果）イベント時に呼ばれる */
  onCommitted?: (segment: TranscriptSegment) => void;
}

/**
 * セグメントIDを生成
 */
function generateSegmentId(): string {
  return `segment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * リアルタイム文字起こしフック
 */
export function useRealtimeTranscription() {
  const [state, setState] = useState<RealtimeTranscriptionState>({
    isActive: false,
    segments: [],
    connectionStatus: "disconnected",
    error: undefined,
  });
  const [soundLevel, setSoundLevel] = useState<number>(0);

  const clientRef = useRef<RealtimeTranscriptionClient | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const currentRecordingIdRef = useRef<string | null>(null);
  const audioStreamRef = useRef<AudioStreamController | null>(null);

  // tRPC mutation for generating realtime token
  const generateTokenMutation = trpc.ai.generateRealtimeToken.useMutation();

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.stop();
      }
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, []);

  /**
   * 音声ストリーミングを開始（プラットフォーム抽象化使用）
   */
  const startAudioStreaming = useCallback(async () => {
    try {
      const audioStream = createAudioStream({
        sampleRate: 16000,
        channels: 1,
        encoding: "pcm_16bit",
        interval: 250,
      });

      audioStreamRef.current = audioStream;

      await audioStream.start(
        (base64Audio) => {
          if (clientRef.current?.isConnected) {
            clientRef.current.sendAudioChunk(base64Audio, 16000);
          }
        },
        (level) => {
          setSoundLevel(level);
        }
      );

    } catch (error) {
      console.error("[useRealtimeTranscription] Failed to start audio streaming:", error);
      setState((prev) => ({
        ...prev,
        error: `マイクアクセス失敗: ${error instanceof Error ? error.message : "不明なエラー"}`,
      }));
    }
  }, []);

  /**
   * 音声ストリーミングを停止
   * @returns Native: ExpoPlayAudioStreamが保存した音声ファイル情報, Web: null
   */
  const stopAudioStreaming = useCallback(async (): Promise<AudioStreamResult | null> => {
    try {
      if (audioStreamRef.current) {
        const result = await audioStreamRef.current.stop();
        audioStreamRef.current = null;
        return result;
      }
    } catch (error) {
      console.error("[useRealtimeTranscription] Failed to stop audio streaming:", error);
    }
    return null;
  }, []);

  // コールバック参照
  const callbacksRef = useRef<RealtimeSessionCallbacks | null>(null);

  /**
   * セッションを開始
   *
   * @param recordingId - 録音ID
   * @param options - リアルタイム文字起こしオプション
   * @param callbacks - イベントコールバック（翻訳連携用）
   */
  const startSession = useCallback(async (
    recordingId: string,
    options: RealtimeOptions = {},
    callbacks?: RealtimeSessionCallbacks
  ): Promise<void> => {
    callbacksRef.current = callbacks || null;

    // 既存セッションがある場合は終了
    if (clientRef.current) {
      await stopSession();
    }

    try {
      setState((prev) => ({
        ...prev,
        isActive: true,
        segments: [],
        connectionStatus: "connecting",
        error: undefined,
      }));

      currentRecordingIdRef.current = recordingId;
      recordingStartTimeRef.current = Date.now();

      const tokenResult = await generateTokenMutation.mutateAsync();
      const token = tokenResult.token;

      // WebSocketクライアント初期化
      const client = new RealtimeTranscriptionClient();
      clientRef.current = client;

      // イベントハンドラ設定
      client.on("session_started", () => {
        setState((prev) => ({
          ...prev,
          connectionStatus: "connected",
        }));
      });

      client.on("partial", (data: { text: string }) => {
        const timestamp = (Date.now() - recordingStartTimeRef.current) / 1000;

        setState((prev) => {
          const lastSegment = prev.segments[prev.segments.length - 1];

          if (lastSegment?.isPartial) {
            const newSegment: TranscriptSegment = { ...lastSegment, text: data.text, timestamp };
            if (callbacksRef.current?.onPartial) {
              setTimeout(() => callbacksRef.current?.onPartial?.(newSegment), 0);
            }
            return { ...prev, segments: [...prev.segments.slice(0, -1), newSegment] };
          }

          const newSegment: TranscriptSegment = {
            id: generateSegmentId(),
            text: data.text,
            isPartial: true,
            timestamp,
          };
          if (callbacksRef.current?.onPartial) {
            setTimeout(() => callbacksRef.current?.onPartial?.(newSegment), 0);
          }
          return { ...prev, segments: [...prev.segments, newSegment] };
        });
      });

      client.on("committed", (data: { text: string }) => {
        const timestamp = (Date.now() - recordingStartTimeRef.current) / 1000;

        setState((prev) => {
          const lastSegment = prev.segments[prev.segments.length - 1];

          if (lastSegment?.isPartial && lastSegment.text === data.text) {
            const newSegment: TranscriptSegment = { ...lastSegment, isPartial: false, timestamp };
            if (callbacksRef.current?.onCommitted) {
              setTimeout(() => callbacksRef.current?.onCommitted?.(newSegment), 0);
            }
            return { ...prev, segments: [...prev.segments.slice(0, -1), newSegment] };
          }

          const newSegment: TranscriptSegment = {
            id: generateSegmentId(),
            text: data.text,
            isPartial: false,
            timestamp,
          };
          if (callbacksRef.current?.onCommitted) {
            setTimeout(() => callbacksRef.current?.onCommitted?.(newSegment), 0);
          }
          return { ...prev, segments: [...prev.segments, newSegment] };
        });
      });

      client.on("committedWithTimestamps", (data: {
        text: string;
        words: Array<{ text: string; start: number; end: number; speaker_id?: string }>;
      }) => {
        const timestamp = (Date.now() - recordingStartTimeRef.current) / 1000;

        // 話者情報を抽出
        const speakerId = data.words.find((w) => w.speaker_id)?.speaker_id;

        setState((prev) => {
          const lastSegment = prev.segments[prev.segments.length - 1];
          let newSegment: TranscriptSegment;

          // 最後のセグメントが同じテキストなら、話者情報を更新するだけ（二重追加を防ぐ）
          if (lastSegment && !lastSegment.isPartial && lastSegment.text === data.text) {
            newSegment = {
              ...lastSegment,
              speaker: speakerId,
            };
            // コールバック呼び出し（翻訳連携用）
            if (callbacksRef.current?.onCommitted) {
              setTimeout(() => callbacksRef.current?.onCommitted?.(newSegment), 0);
            }
            return {
              ...prev,
              segments: [
                ...prev.segments.slice(0, -1),
                newSegment,
              ],
            };
          }

          // 最後のpartialセグメントをcommittedに変換（話者情報付き）
          if (lastSegment?.isPartial) {
            newSegment = {
              ...lastSegment,
              text: data.text,
              isPartial: false,
              timestamp,
              speaker: speakerId,
            };
            // コールバック呼び出し（翻訳連携用）
            if (callbacksRef.current?.onCommitted) {
              setTimeout(() => callbacksRef.current?.onCommitted?.(newSegment), 0);
            }
            return {
              ...prev,
              segments: [
                ...prev.segments.slice(0, -1),
                newSegment,
              ],
            };
          }

          // 新しいcommittedセグメントを追加
          newSegment = {
            id: generateSegmentId(),
            text: data.text,
            isPartial: false,
            timestamp,
            speaker: speakerId,
          };
          // コールバック呼び出し（翻訳連携用）
          if (callbacksRef.current?.onCommitted) {
            setTimeout(() => callbacksRef.current?.onCommitted?.(newSegment), 0);
          }
          return {
            ...prev,
            segments: [
              ...prev.segments,
              newSegment,
            ],
          };
        });
      });

      client.on("error", (error: { code?: string; message: string }) => {
        console.error("[useRealtimeTranscription] Error:", error);

        setState((prev) => ({
          ...prev,
          connectionStatus: "error",
          error: error.message || "接続エラーが発生しました",
        }));

        if (error.code === "QUOTA_EXCEEDED") {
          Alert.alert(
            "クォータ超過",
            "文字起こしクォータに達しました。録音は継続できますが、リアルタイム文字起こしは無効化されます。"
          );
        }
      });

      client.on("close", () => {
        setState((prev) => ({
          ...prev,
          isActive: false,
          connectionStatus: "disconnected",
        }));
      });

      // WebSocket接続
      const connectionOptions: RealtimeOptions = {
        languageCode: options.languageCode || "ja",
        enableDiarization: options.enableDiarization ?? true,
        vad: options.vad || {
          silenceThresholdSecs: 0.5,
          minSpeechDurationSecs: 0.25,
        },
      };

      await client.connect(token, connectionOptions);

      if (!options.skipAudioStreaming) {
        await startAudioStreaming();
      }
    } catch (error) {
      console.error("[useRealtimeTranscription] Failed to start session:", error);

      setState((prev) => ({
        ...prev,
        isActive: false,
        connectionStatus: "error",
        error: error instanceof Error ? error.message : "セッション開始に失敗しました",
      }));

      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }

      throw error;
    }
  }, [startAudioStreaming, generateTokenMutation]);

  /**
   * セッションを停止
   * @returns Native: ExpoPlayAudioStreamが保存した音声ファイル情報, Web: null
   */
  const stopSession = useCallback(async (): Promise<AudioStreamResult | null> => {
    const streamResult = await stopAudioStreaming();

    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isActive: false,
      connectionStatus: "disconnected",
    }));

    currentRecordingIdRef.current = null;
    return streamResult;
  }, [stopAudioStreaming]);

  /**
   * 音声チャンクを送信（手動送信用、通常は自動ストリーミングを使用）
   *
   * @param audioBase64 - Base64エンコードされた音声データ
   * @param sampleRate - サンプルレート（Hz）
   */
  const sendAudioChunk = useCallback((audioBase64: string, sampleRate: number = 16000): void => {
    if (!clientRef.current || !clientRef.current.isConnected) {
      console.warn("[useRealtimeTranscription] Client not connected, cannot send audio chunk");
      return;
    }

    clientRef.current.sendAudioChunk(audioBase64, sampleRate);
  }, []);

  /**
   * 表示用にセグメントを結合（同じ話者の連続セグメントは空白で結合）
   * useMemoでキャッシュし、state.segmentsが変わった時のみ再計算
   */
  const mergedSegments = useMemo((): TranscriptSegment[] => {
    const merged: TranscriptSegment[] = [];

    for (const segment of state.segments) {
      const last = merged[merged.length - 1];

      // 同じ話者（または両方話者なし）かつ両方committedの場合は結合
      if (
        last &&
        !last.isPartial &&
        !segment.isPartial &&
        last.speaker === segment.speaker
      ) {
        merged[merged.length - 1] = {
          ...last,
          text: `${last.text} ${segment.text}`,
          timestamp: segment.timestamp,
        };
      } else {
        merged.push({ ...segment });
      }
    }

    return merged;
  }, [state.segments]);

  /**
   * セグメントを統合して最終的な文字起こしテキストを生成
   *
   * @returns 統合されたテキスト
   */
  const consolidateSegments = useCallback((): string => {
    return mergedSegments
      .filter((s) => !s.isPartial)
      .map((s) => {
        if (s.speaker) {
          return `[${s.speaker}]: ${s.text}`;
        }
        return s.text;
      })
      .join("\n");
  }, [mergedSegments]);

  return {
    state,
    startSession,
    stopSession,
    sendAudioChunk,
    consolidateSegments,
    mergedSegments,
    soundLevel,
  };
}
