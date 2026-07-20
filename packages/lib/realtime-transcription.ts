/**
 * ElevenLabs Realtime Transcription WebSocket Client
 *
 * リアルタイム文字起こしのためのWebSocket接続を管理します。
 */

import type {
  RealtimeOptions,
  RealtimeMessage,
  PartialTranscriptMessage,
  CommittedTranscriptMessage,
  CommittedTranscriptWithTimestampsMessage,
} from "@/packages/types/realtime-transcription";

const ELEVENLABS_REALTIME_ENDPOINT =
  "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
const ELEVENLABS_REALTIME_MODEL = "scribe_v2_realtime";
const ELEVENLABS_ERROR_MESSAGE_TYPES = new Set([
  "auth_error",
  "quota_exceeded",
  "transcriber_error",
  "input_error",
  "error",
  "commit_throttled",
  "unaccepted_terms",
  "rate_limited",
  "queue_overflow",
  "resource_exhausted",
  "session_time_limit_exceeded",
  "chunk_size_exceeded",
  "insufficient_audio_activity",
]);

/**
 * イベントハンドラの型定義
 */
type EventHandler = (data: any) => void;

/**
 * WebSocket接続イベント
 */
export type RealtimeEvent =
  | "session_started"
  | "partial"
  | "committed"
  | "committedWithTimestamps"
  | "error"
  | "close";

function getMessageType(message: RealtimeMessage): string {
  return message.message_type || message.type || "unknown";
}

function getErrorMessage(message: RealtimeMessage): string {
  if (typeof message.error === "string") {
    return message.error;
  }
  if (typeof message.message === "string") {
    return message.message;
  }
  return "Realtime transcription failed";
}

function isErrorMessageType(messageType: string): boolean {
  return (
    ELEVENLABS_ERROR_MESSAGE_TYPES.has(messageType) ||
    messageType.endsWith("_error")
  );
}

/**
 * Realtime Transcription WebSocketクライアント
 */
export class RealtimeTranscriptionClient {
  private ws: WebSocket | null = null;
  private eventHandlers: Map<RealtimeEvent, EventHandler> = new Map();
  private isConnecting = false;

  /**
   * WebSocket接続を確立
   *
   * @param token - ワンタイムトークン（サーバーから取得）
   * @param options - リアルタイム文字起こしのオプション
   */
  async connect(token: string, options: RealtimeOptions = {}): Promise<void> {
    if (this.isConnecting) {
      console.log("[RealtimeClient] Connection already in progress");
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("[RealtimeClient] Already connected");
      return;
    }

    this.isConnecting = true;

    try {
      const params = new URLSearchParams({
        token,
        model_id: ELEVENLABS_REALTIME_MODEL,
        audio_format: "pcm_16000",
        language_code: options.languageCode || "ja",
        include_timestamps: "true",
        commit_strategy: "vad", // Voice Activity Detection による自動コミット
        ...(options.vad && {
          vad_silence_threshold_secs: String(
            options.vad.silenceThresholdSecs ?? 0.5,
          ),
          min_speech_duration_ms: String(
            options.vad.minSpeechDurationMs ?? 250,
          ),
        }),
      });

      const url = `${ELEVENLABS_REALTIME_ENDPOINT}?${params}`;

      console.log("[RealtimeClient] Connecting to WebSocket...");
      const ws = new WebSocket(url);
      this.ws = ws;

      // ElevenLabs が設定を受理した session_started まで待つ。
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("Realtime session start timeout"));
        }, 10000); // 10秒でタイムアウト

        const resolveSession = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
        };

        const rejectSession = (error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        };

        ws.onopen = () => {
          console.log("[RealtimeClient] WebSocket connected");
        };

        ws.onerror = () => {
          const error = new Error("WebSocket connection failed");
          console.error("[RealtimeClient] WebSocket error");
          this.isConnecting = false;
          this.emit("error", { message: error.message });
          rejectSession(error);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as RealtimeMessage;
            const messageType = getMessageType(message);
            if (messageType === "session_started") {
              this.isConnecting = false;
              this.emit("session_started", message);
              resolveSession();
              return;
            }

            this.handleMessage(message);
            if (isErrorMessageType(messageType)) {
              rejectSession(new Error(getErrorMessage(message)));
            }
          } catch (error) {
            const parseError = new Error(
              "サーバーから不正なメッセージを受信しました",
            );
            console.error("[RealtimeClient] Failed to parse message");
            this.emit("error", { message: parseError.message });
            rejectSession(parseError);
          }
        };

        ws.onclose = () => {
          console.log("[RealtimeClient] WebSocket closed");
          this.isConnecting = false;
          if (this.ws === ws) {
            this.ws = null;
          }
          if (!settled) {
            rejectSession(
              new Error("Realtime transcription connection closed"),
            );
            return;
          }
          this.emit("close", {});
        };
      });
    } catch (error) {
      this.isConnecting = false;
      const ws = this.ws;
      this.ws = null;
      ws?.close();
      throw error;
    }
  }

  /**
   * 音声チャンクを送信
   *
   * @param audioBase64 - Base64エンコードされた音声データ
   * @param sampleRate - サンプルレート（Hz）
   */
  sendAudioChunk(audioBase64: string, sampleRate: number = 16000): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(
        "[RealtimeClient] WebSocket not connected, cannot send audio chunk",
      );
      return;
    }

    // ElevenLabs Realtime API の正しいメッセージフォーマット
    const message = {
      message_type: "input_audio_chunk",
      audio_base_64: audioBase64,
      sample_rate: sampleRate,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * WebSocket接続を切断
   */
  disconnect(): void {
    const ws = this.ws;
    this.ws = null;
    this.eventHandlers.clear();
    if (ws) {
      console.log("[RealtimeClient] Disconnecting WebSocket");
      ws.close();
    }
    this.isConnecting = false;
  }

  /**
   * イベントハンドラを登録
   *
   * @param event - イベント名
   * @param handler - イベントハンドラ関数
   */
  on(event: RealtimeEvent, handler: EventHandler): void {
    this.eventHandlers.set(event, handler);
  }

  /**
   * イベントハンドラを削除
   *
   * @param event - イベント名
   */
  off(event: RealtimeEvent): void {
    this.eventHandlers.delete(event);
  }

  /**
   * 接続状態を取得
   */
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * WebSocketメッセージを処理
   *
   * @param message - 受信したメッセージ
   */
  private handleMessage(message: RealtimeMessage): void {
    const messageType = getMessageType(message);
    console.log("[RealtimeClient] Received message:", messageType);

    if (isErrorMessageType(messageType)) {
      console.error("[RealtimeClient] Server error:", messageType);
      this.emit("error", {
        code: messageType,
        message: getErrorMessage(message),
      });
      return;
    }

    switch (messageType) {
      case "session_started":
        // セッション開始は connect() 内で処理済み
        break;

      case "partial_transcript": {
        const data = message as PartialTranscriptMessage;
        this.emit("partial", { text: data.text });
        break;
      }

      case "committed_transcript": {
        const data = message as CommittedTranscriptMessage;
        this.emit("committed", { text: data.text });
        break;
      }

      case "committed_transcript_with_timestamps": {
        const data = message as CommittedTranscriptWithTimestampsMessage;
        this.emit("committedWithTimestamps", {
          text: data.text,
          words: data.words,
        });
        break;
      }

      default:
        console.warn("[RealtimeClient] Unknown message type:", messageType);
    }
  }

  /**
   * イベントを発火
   *
   * @param event - イベント名
   * @param data - イベントデータ
   */
  private emit(event: RealtimeEvent, data: any): void {
    const handler = this.eventHandlers.get(event);
    if (handler) {
      handler(data);
    }
  }
}
