/**
 * Moonshine ローカルモデル管理Hook - Web 実装
 *
 * @huggingface/transformers を使って、ブラウザ上で
 * ONNX Runtime Web 経由のオフライン音声認識を提供する
 *
 * モデル: UsefulSensors/moonshine-tiny-ja (日本語対応)
 * - バッチ推論: pipeline("automatic-speech-recognition")
 * - ストリーミング: チャンクを蓄積してバッチ推論
 */

import { useState, useCallback, useRef } from "react";
import type { MoonshineModelState, UseMoonshineModelReturn } from "./use-moonshine-model";

export { type MoonshineModelState, type UseMoonshineModelReturn };

const MODEL_ID = "UsefulSensors/moonshine-tiny-ja";
const SAMPLE_RATE = 16000;

// @huggingface/transformers は動的インポート（重いため）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PipelineType = (audio: Float32Array | { array: Float32Array; sampling_rate: number }) => Promise<{ text: string }>;

export function useMoonshineModel(): UseMoonshineModelReturn {
  const pipelineRef = useRef<PipelineType | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const [state, setState] = useState<MoonshineModelState>({
    isReady: false,
    isGenerating: false,
    downloadProgress: 0,
    error: null,
    committedTranscription: "",
    nonCommittedTranscription: "",
  });

  const ensurePipeline = useCallback(async (): Promise<PipelineType> => {
    if (pipelineRef.current) return pipelineRef.current;

    setState((prev) => ({ ...prev, downloadProgress: 0.05 }));

    const { pipeline, env } = await import("@huggingface/transformers");
    // WebGPU が使えない環境では WASM にフォールバック
    if (env.backends.onnx.wasm) env.backends.onnx.wasm.proxy = true;

    const pipe = await pipeline("automatic-speech-recognition", MODEL_ID, {
      progress_callback: (info) => {
        if (typeof info === "object" && "progress" in info && typeof info.progress === "number") {
          setState((prev) => ({ ...prev, downloadProgress: info.progress! / 100 }));
        }
      },
    }) as unknown as PipelineType;

    pipelineRef.current = pipe;
    setState((prev) => ({ ...prev, isReady: true, downloadProgress: 1, error: null }));
    return pipe;
  }, []);

  // パイプラインは transcribeWaveform / startStreaming 呼び出し時に遅延ロードする。
  // 詳細画面など、Moonshine を使わない画面でもマウント時に巨大モデルをダウンロード
  // してしまう問題を防ぐ。

  const transcribeWaveform = useCallback(
    async (waveform: Float32Array): Promise<string> => {
      setState((prev) => ({ ...prev, isGenerating: true }));
      try {
        const pipe = await ensurePipeline();
        const result = await pipe({ array: waveform, sampling_rate: SAMPLE_RATE });
        setState((prev) => ({ ...prev, isGenerating: false }));
        return result.text;
      } catch (err) {
        const message = err instanceof Error ? err.message : "文字起こしに失敗しました";
        setState((prev) => ({ ...prev, isGenerating: false, error: message }));
        throw err;
      }
    },
    [ensurePipeline]
  );

  const startStreaming = useCallback(async (): Promise<string> => {
    chunksRef.current = [];
    // ストリーミング中は音声チャンクを蓄積し、停止時にバッチ推論
    return "";
  }, []);

  const sendAudioChunk = useCallback((chunk: Float32Array) => {
    chunksRef.current.push(chunk);
    // 暫定テキストはリアルタイム表示しない（バッチモデルのため）
    setState((prev) => ({
      ...prev,
      nonCommittedTranscription: `録音中... (${chunksRef.current.length} チャンク)`,
    }));
  }, []);

  const stopStreaming = useCallback(async () => {
    if (chunksRef.current.length === 0) return;

    // 全チャンクを結合して一括推論
    const totalLength = chunksRef.current.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    chunksRef.current = [];

    setState((prev) => ({ ...prev, nonCommittedTranscription: "", isGenerating: true }));
    try {
      const pipe = await ensurePipeline();
      const result = await pipe({ array: merged, sampling_rate: SAMPLE_RATE });
      setState((prev) => ({
        ...prev,
        isGenerating: false,
        committedTranscription: (prev.committedTranscription + " " + result.text).trim(),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "文字起こしに失敗しました";
      setState((prev) => ({ ...prev, isGenerating: false, error: message }));
    }
  }, [ensurePipeline]);

  return {
    state,
    transcribeWaveform,
    startStreaming,
    sendAudioChunk,
    // Web版の stopStreaming は async だが型は void に合わせる
    stopStreaming: () => { stopStreaming(); },
    isSupported: true,
  };
}
