/**
 * Moonshine ローカルモデル管理Hook - Web スタブ
 *
 * ネイティブ実装は use-moonshine-model.native.ts
 */

export interface MoonshineModelState {
  isReady: boolean;
  isGenerating: boolean;
  downloadProgress: number;
  error: string | null;
  /** 確定済みストリーミングテキスト */
  committedTranscription: string;
  /** 処理中の暫定テキスト */
  nonCommittedTranscription: string;
}

export interface UseMoonshineModelReturn {
  state: MoonshineModelState;
  /** バッチ文字起こし: Float32Array 波形（16kHz）→テキスト */
  transcribeWaveform: (waveform: Float32Array) => Promise<string>;
  /** ストリーミング開始（完了時に最終テキストを返す） */
  startStreaming: () => Promise<string>;
  /** ストリーミングに音声チャンクを追加 */
  sendAudioChunk: (chunk: Float32Array) => void;
  /** ストリーミング停止 */
  stopStreaming: () => void;
  isSupported: boolean;
}

export function useMoonshineModel(): UseMoonshineModelReturn {
  return {
    state: {
      isReady: false,
      isGenerating: false,
      downloadProgress: 0,
      error: null,
      committedTranscription: "",
      nonCommittedTranscription: "",
    },
    transcribeWaveform: async () => {
      throw new Error("Moonshine は iOS/Android 専用です");
    },
    startStreaming: async () => {
      throw new Error("Moonshine は iOS/Android 専用です");
    },
    sendAudioChunk: () => {},
    stopStreaming: () => {},
    isSupported: false,
  };
}
