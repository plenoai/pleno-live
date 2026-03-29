/**
 * Moonshine ローカルモデル管理Hook - ネイティブ スタブ
 *
 * react-native-executorch のネイティブモジュール初期化がAndroidで
 * アプリ起動をクラッシュさせるため、一時的にスタブ化。
 * TODO: react-native-executorch の安定版で再有効化
 */

import type { MoonshineModelState, UseMoonshineModelReturn } from "./use-moonshine-model";

export { type MoonshineModelState, type UseMoonshineModelReturn };

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
      throw new Error("Moonshine は現在無効化されています");
    },
    startStreaming: async () => {
      throw new Error("Moonshine は現在無効化されています");
    },
    sendAudioChunk: () => {},
    stopStreaming: () => {},
    isSupported: false,
  };
}
