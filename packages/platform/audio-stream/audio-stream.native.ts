/**
 * Native (iOS/Android) Audio Stream Implementation
 * @mykin-ai/expo-audio-stream を使用
 */

import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import type { AudioStreamConfig, AudioStreamController, AudioStreamResult } from './index';

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subscription = ExpoPlayAudioStream.subscribeToAudioEvents(async (event: any) => {
          if (event.data && typeof event.data === 'string') {
            onChunk(event.data);
          }
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
