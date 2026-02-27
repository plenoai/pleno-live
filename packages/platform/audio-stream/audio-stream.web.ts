/**
 * Web Audio Stream Implementation
 * Web Audio API を使用してリアルタイム音声ストリーミング
 */

import type { AudioStreamConfig, AudioStreamController } from './index';

/**
 * Float32Array を 16-bit PCM に変換して Base64 エンコード
 */
function float32ToPcm16Base64(float32Array: Float32Array): string {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const uint8 = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

/**
 * Float32Array から RMS (0〜1) を計算
 */
function calculateRms(float32Array: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < float32Array.length; i++) {
    sum += float32Array[i] * float32Array[i];
  }
  return Math.sqrt(sum / float32Array.length);
}

export function createAudioStream(config: AudioStreamConfig): AudioStreamController {
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let scriptProcessor: ScriptProcessorNode | null = null;
  let isActive = false;

  return {
    async start(
      onChunk: (base64Audio: string) => void,
      onSoundLevel?: (level: number) => void
    ): Promise<void> {
      if (isActive) {
        console.warn('[AudioStream.web] Already streaming');
        return;
      }

      try {
        console.log('[AudioStream.web] Starting audio stream...');

        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext({ sampleRate: config.sampleRate });

        const source = audioContext.createMediaStreamSource(mediaStream);

        // ScriptProcessorNode（非推奨だが、リアルタイムPCMデータ取得に使用）
        const bufferSize = Math.round((config.sampleRate * config.interval) / 1000);
        // bufferSize は 2^n である必要がある
        const validBufferSize = Math.pow(2, Math.ceil(Math.log2(bufferSize)));
        scriptProcessor = audioContext.createScriptProcessor(validBufferSize, 1, 1);

        scriptProcessor.onaudioprocess = (event) => {
          if (!isActive) return;

          const inputData = event.inputBuffer.getChannelData(0);
          const base64 = float32ToPcm16Base64(inputData);
          onChunk(base64);

          if (onSoundLevel) {
            const rms = calculateRms(inputData);
            onSoundLevel(rms);
          }
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        isActive = true;
        console.log('[AudioStream.web] Audio stream started');
      } catch (error) {
        console.error('[AudioStream.web] Failed to start:', error);
        isActive = false;
        throw error;
      }
    },

    async stop(): Promise<null> {
      if (!isActive) return null;

      console.log('[AudioStream.web] Stopping audio stream...');

      if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
      }

      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }

      if (audioContext) {
        await audioContext.close();
        audioContext = null;
      }

      isActive = false;
      console.log('[AudioStream.web] Audio stream stopped');
      return null;
    },

    isStreaming(): boolean {
      return isActive;
    },
  };
}
