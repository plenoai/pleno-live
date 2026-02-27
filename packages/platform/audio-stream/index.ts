/**
 * Audio Stream Abstraction
 *
 * リアルタイム文字起こし用の音声ストリーミング
 * WebAudioStream (Web) / ExpoPlayAudioStream (Native) を統一インターフェースで提供
 */

export interface AudioStreamConfig {
  sampleRate: number;
  channels: 1 | 2;
  encoding: 'pcm_16bit';
  interval: number;
}

export interface AudioStreamResult {
  fileUri: string;
  mimeType: string;
}

export interface AudioStreamController {
  start(onChunk: (base64Audio: string) => void, onSoundLevel?: (level: number) => void): Promise<void>;
  stop(): Promise<AudioStreamResult | null>;
  isStreaming(): boolean;
}

// Metro/Webpack resolves platform-specific files (.native.ts, .web.ts)
export { createAudioStream } from './audio-stream';
