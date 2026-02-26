/**
 * Native (iOS/Android) Audio Metering Implementation
 * @mykin-ai/expo-audio-stream を使用して音声レベルを取得
 */

import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import type { AudioMeteringConfig, AudioMeteringController } from './index';

/**
 * Base64 文字列が有効かを事前チェック
 */
function isValidBase64(str: string): boolean {
  return str.length > 0 && str.length % 4 === 0 && /^[A-Za-z0-9+/]+=*$/.test(str);
}

/**
 * Base64 PCM データから RMS を計算
 */
function calculateRmsFromBase64(base64Data: string): number {
  if (!isValidBase64(base64Data)) return 0;

  const binaryString = atob(base64Data);
  const len = binaryString.length;

  let sumSquares = 0;
  let sampleCount = 0;

  for (let i = 0; i < len - 1; i += 2) {
    const low = binaryString.charCodeAt(i);
    const high = binaryString.charCodeAt(i + 1);
    let sample = (high << 8) | low;
    if (sample >= 32768) sample -= 65536;
    const normalizedSample = sample / 32768;
    sumSquares += normalizedSample * normalizedSample;
    sampleCount++;
  }

  if (sampleCount === 0) return 0;
  return Math.sqrt(sumSquares / sampleCount);
}

/**
 * RMS値をdBに変換 (-60 〜 0)
 */
function rmsToDb(rms: number): number {
  const db = rms > 0 ? 20 * Math.log10(rms) : -60;
  return Math.max(-60, Math.min(0, db));
}

export function createAudioMetering(config?: AudioMeteringConfig): AudioMeteringController {
  const sampleRate = config?.sampleRate ?? 16000;
  const updateInterval = config?.updateInterval ?? 100;

  let isStreaming = false;
  let subscription: { remove: () => void } | null = null;
  const callbacks: Set<(db: number) => void> = new Set();

  return {
    async start(): Promise<void> {
      if (isStreaming) return;

      try {
        console.log('[AudioMetering.native] Starting audio stream...');
        isStreaming = true;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subscription = ExpoPlayAudioStream.subscribeToAudioEvents(async (event: any) => {
          let db = -60;

          if (event.data && typeof event.data === 'string') {
            const rms = calculateRmsFromBase64(event.data);
            db = rmsToDb(rms);
          } else if (event.soundLevel !== undefined) {
            db = rmsToDb(event.soundLevel);
          }

          callbacks.forEach((cb) => cb(db));
        });

        await ExpoPlayAudioStream.startRecording({
          sampleRate: sampleRate as 16000 | 44100 | 48000,
          channels: 1,
          encoding: 'pcm_16bit',
          interval: updateInterval,
        });

        console.log('[AudioMetering.native] Audio stream started');
      } catch (error) {
        console.error('[AudioMetering.native] Failed to start:', error);
        isStreaming = false;
        throw error;
      }
    },

    async stop(): Promise<void> {
      if (!isStreaming) return;

      try {
        console.log('[AudioMetering.native] Stopping audio stream...');

        if (subscription) {
          subscription.remove();
          subscription = null;
        }

        await ExpoPlayAudioStream.stopRecording();
        isStreaming = false;

        console.log('[AudioMetering.native] Audio stream stopped');
      } catch (error) {
        console.error('[AudioMetering.native] Failed to stop:', error);
        isStreaming = false;
      }
    },

    onMeteringUpdate(callback: (db: number) => void): () => void {
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },

    isActive(): boolean {
      return isStreaming;
    },
  };
}
