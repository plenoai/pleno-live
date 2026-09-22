/**
 * Native (iOS/Android) Audio Stream Implementation
 * @mykin-ai/expo-audio-stream を使用
 */

import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import { FileSystem } from '../filesystem';
import type { AudioStreamConfig, AudioStreamController, AudioStreamResult } from './index';

// @mykin-ai/expo-audio-stream が書き出す WAV の標準ヘッダ長。
// AudioData イベントの data がゼロ化される Android 実機不具合があるため、
// イベントの fileUri/lastEmittedSize/totalSize を使ってファイルから
// PCM の増分を直接読む（ファイルには実データが書き込まれている）。
const WAV_HEADER_BYTES = 44;

export function createAudioStream(config: AudioStreamConfig): AudioStreamController {
  let isActive = false;
  let subscription: { remove: () => void } | null = null;

  return {
    async start(
      onChunk: (base64Audio: string) => void,
      onSoundLevel?: (level: number) => void
    ): Promise<void> {
      if (isActive) {
        console.warn('[AudioStream.native] Already streaming');
        return;
      }

      try {
        console.log('[AudioStream.native] Starting audio stream...');

        // ファイル読み取りを直列化して PCM チャンクの順序を保つ
        let readQueue = Promise.resolve();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subscription = ExpoPlayAudioStream.subscribeToAudioEvents(async (event: any) => {
          const fileUri: string | undefined = event.fileUri;
          const totalSize: number = event.totalSize ?? 0;
          const eventDataSize: number = event.eventDataSize ?? 0;
          // eventDataSize は今回 emit されたバイト数（ファイル増分と一致）なので
          // totalSize - eventDataSize が読み始め位置（初回のみWAVヘッダ44バイト分をスキップ）
          const readPosition = Math.max(WAV_HEADER_BYTES, totalSize - eventDataSize);

          const sendChunk = async () => {
            if (fileUri && totalSize > readPosition) {
              try {
                const base64 = await FileSystem.readAsBase64Range(
                  fileUri,
                  readPosition,
                  totalSize - readPosition
                );
                if (base64) {
                  onChunk(base64);
                }
                return;
              } catch (e) {
                // ファイル読み取りに失敗した場合のみイベント内のデータを使う
                console.warn('[AudioStream.native] File chunk read failed, using event data:', e);
              }
            }
            if (event.data && typeof event.data === 'string') {
              onChunk(event.data);
            }
          };

          readQueue = readQueue.then(sendChunk, sendChunk);
          await readQueue;

          if (event.soundLevel !== undefined && onSoundLevel) {
            onSoundLevel(event.soundLevel);
          }
        });

        await ExpoPlayAudioStream.startRecording({
          sampleRate: config.sampleRate as 16000 | 44100 | 48000,
          channels: config.channels,
          encoding: config.encoding,
          interval: config.interval,
        });

        isActive = true;
        console.log('[AudioStream.native] Audio stream started');
      } catch (error) {
        console.error('[AudioStream.native] Failed to start:', error);
        isActive = false;
        throw error;
      }
    },

    async stop(): Promise<AudioStreamResult | null> {
      if (!isActive) return null;

      try {
        console.log('[AudioStream.native] Stopping audio stream...');

        if (subscription) {
          subscription.remove();
          subscription = null;
        }

        const result = await ExpoPlayAudioStream.stopRecording();
        isActive = false;

        console.log('[AudioStream.native] Audio stream stopped');
        return { fileUri: result.fileUri, mimeType: result.mimeType };
      } catch (error) {
        console.error('[AudioStream.native] Failed to stop:', error);
        isActive = false;
        return null;
      }
    },

    isStreaming(): boolean {
      return isActive;
    },
  };
}
