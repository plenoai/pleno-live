/**
 * Moonshine ローカルモデル管理Hook - ネイティブ実装
 *
 * react-native-executorch の useSpeechToText を使って
 * iOS/Android 上でオフライン英語音声認識を提供する
 *
 * モデル: Moonshine Tiny (~149MB、英語専用)
 * 16kHz Float32Array の波形データを入力として受け付ける
 */

import { useCallback } from "react";
import { useSpeechToText } from "react-native-executorch";
import type { MoonshineModelState, UseMoonshineModelReturn } from "./use-moonshine-model";

export { type MoonshineModelState, type UseMoonshineModelReturn };

// HuggingFace 上の Software Mansion 提供 Moonshine Tiny モデル
const MOONSHINE_TINY_MODEL = {
  isMultilingual: false,
  encoderSource:
    "https://huggingface.co/software-mansion/react-native-executorch-moonshine-tiny/resolve/main/xnnpack/moonshine_tiny_xnnpack_encoder.pte",
  decoderSource:
    "https://huggingface.co/software-mansion/react-native-executorch-moonshine-tiny/resolve/main/xnnpack/moonshine_tiny_xnnpack_decoder.pte",
  tokenizerSource:
    "https://huggingface.co/software-mansion/react-native-executorch-moonshine-tiny/resolve/main/moonshine_tiny_tokenizer.json",
};

export function useMoonshineModel(): UseMoonshineModelReturn {
  const {
    transcribe,
    stream,
    streamInsert,
    streamStop,
    isReady,
    isGenerating,
    error,
    downloadProgress,
    committedTranscription,
    nonCommittedTranscription,
  } = useSpeechToText({ model: MOONSHINE_TINY_MODEL });

  const state: MoonshineModelState = {
    isReady,
    isGenerating,
    downloadProgress: downloadProgress ?? 0,
    error: error ? String(error) : null,
    committedTranscription: committedTranscription ?? "",
    nonCommittedTranscription: nonCommittedTranscription ?? "",
  };

  const transcribeWaveform = useCallback(
    async (waveform: Float32Array): Promise<string> => {
      if (!isReady) throw new Error("Moonshine モデルが読み込まれていません");
      return await transcribe(waveform);
    },
    [transcribe, isReady]
  );

  const startStreaming = useCallback(async (): Promise<string> => {
    return await stream();
  }, [stream]);

  const sendAudioChunk = useCallback(
    (chunk: Float32Array) => {
      streamInsert(chunk);
    },
    [streamInsert]
  );

  const stopStreaming = useCallback(() => {
    streamStop();
  }, [streamStop]);

  return {
    state,
    transcribeWaveform,
    startStreaming,
    sendAudioChunk,
    stopStreaming,
    isSupported: true,
  };
}
