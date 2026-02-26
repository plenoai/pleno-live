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
  ErrorMessage,
} from "@/packages/types/realtime-transcription";

const ELEVENLABS_REALTIME_ENDPOINT = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

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
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("[RealtimeClient] Already connected");
      return;
    }

    if (this.isConnecting) {
      console.log("[RealtimeClient] Connection already in progress");
      return;
    }

    this.isConnecting = true;

    try {
      const params = new URLSearchParams({
        token,
        language_code: options.languageCode || "ja",
        diarize: String(options.enableDiarization ?? true),
        include_timestamps: "true",
        commit_strategy: "vad", // Voice Activity Detection による自動コミット
        ...(options.vad && {
          vad_silence_threshold_secs: String(options.vad.silenceThresholdSecs ?? 0.5),
          vad_min_speech_duration_secs: String(options.vad.minSpeechDurationSecs ?? 0.25),
        }),
      });

      const url = `${ELEVENLABS_REALTIME_ENDPOINT}?${params}`;

      console.log("[RealtimeClient] Connecting to WebSocket...");
      this.ws = new WebSocket(url);

      // Promise で接続完了を待つ
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("WebSocket connection timeout"));
        }, 10000); // 10秒でタイムアウト

        this.ws!.onopen = () => {
          clearTimeout(timeout);
          console.log("[RealtimeClient] WebSocket connected");
          this.isConnecting = false;
          this.emit("session_started", {});
          resolve();
        };

        this.ws!.onerror = (error) => {
          clearTimeout(timeout);
          console.error("[RealtimeClient] WebSocket error:", error);
          this.isConnecting = false;
          this.emit("error", { message: "WebSocket connection failed" });
          reject(error);
        };

        this.ws!.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as RealtimeMessage;
            this.handleMessage(message);
          } catch (error) {
            console.error("[RealtimeClient] Failed to parse message:", error);
            this.emit("error", { message: "サーバーから不正なメッセージを受信しました" });
          }
        };

        this.ws!.onclose = () => {
          console.log("[RealtimeClient] WebSocket closed");
          this.isConnecting = false;
          this.emit("close", {});
        };
      });
    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * 音声チャンクを送信
   *
   * @param audioBase64 - Base64エンコードされた音声データ
   * @param sampleRate - サンプルレート（Hz）
   * @param commit - この音声チャンクでコミットするか（手動コミットモードの場合）
   */
  sendAudioChunk(audioBase64: string, sampleRate: number = 16000, commit: boolean = false): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[RealtimeClient] WebSocket not connected, cannot send audio chunk");
      return;
    }

    // ElevenLabs Realtime API の正しいメッセージフォーマット
    const message = {
      message_type: "input_audio_chunk",
      audio_base_64: audioBase64,
      sample_rate: sampleRate,
      commit,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * 手動コミット（手動コミットモードの場合に使用）
   */
  commit(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[RealtimeClient] WebSocket not connected, cannot commit");
      return;
    }

    // ElevenLabs Realtime API の正しいメッセージフォーマット
    const message = {
      message_type: "input_audio_chunk",
      commit: true,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * WebSocket接続を切断
   */
  disconnect(): void {
    if (this.ws) {
      console.log("[RealtimeClient] Disconnecting WebSocket");
      this.ws.close();
      this.ws = null;
    }
    this.eventHandlers.clear();
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
    // ElevenLabsは message_type を使用する
    const messageType = (message as any).message_type || message.type;
    console.log("[RealtimeClient] Received message:", messageType, JSON.stringify(message).substring(0, 200));

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

      case "error": {
        const data = message as ErrorMessage;
        console.error("[RealtimeClient] Server error:", data.code, data.message);
        this.emit("error", {
          code: data.code,
          message: data.message,
        });
        break;
      }

      default:
        console.warn("[RealtimeClient] Unknown message type:", message.type);
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
