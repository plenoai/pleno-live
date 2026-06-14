/**
 * リアルタイム翻訳フック
 *
 * 文字起こしセグメントを受け取り、設定された言語に翻訳します。
 * - Debounce: partialテキストの頻繁な更新を制御
 * - バッチ処理: 複数セグメントをまとめて翻訳
 * - 翻訳状態管理は純粋な TranslationStore に委譲（stale-while-revalidate等）
 */

import { useCallback, useRef, useEffect, useReducer } from "react";
import { trpc } from "@/packages/lib/trpc";
import { TranslationStore } from "@/packages/lib/translation-store";
import type {
  TranscriptSegment,
  TranslationStatus,
} from "@/packages/types/realtime-transcription";

interface UseRealtimeTranslationOptions {
  enabled: boolean;
  targetLanguage: string;
  debounceMs?: number;
  batchDelayMs?: number;
}

export function useRealtimeTranslation(options: UseRealtimeTranslationOptions) {
  const {
    enabled,
    targetLanguage,
    debounceMs = 500,
    batchDelayMs = 300,
  } = options;

  const translateMutation = trpc.ai.translate.useMutation();

  // 翻訳状態の単一の真実源（純粋ストア）
  const storeRef = useRef<TranslationStore>(new TranslationStore());

  // ストア変更時に再レンダリングを強制する
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Debounce用タイマー
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // バッチ処理用キュー
  const pendingQueueRef = useRef<{ id: string; text: string }[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // バッチ翻訳を実行
  const executeBatchTranslation = useCallback(async () => {
    if (!enabled || pendingQueueRef.current.length === 0) return;

    const batch = [...pendingQueueRef.current];
    pendingQueueRef.current = [];

    // ストアにリクエストを登録。キャッシュ済み/未変化のものは即解決され除外される。
    const toSend = storeRef.current.request(batch);
    forceUpdate();

    if (toSend.length === 0) return;

    try {
      const result = await translateMutation.mutateAsync({
        texts: toSend,
        targetLanguage,
      });

      storeRef.current.resolve(
        result.translations.map((t) => ({
          id: t.id,
          translation: t.translatedText,
        })),
      );
      forceUpdate();
    } catch (error) {
      console.error("[useRealtimeTranslation] Translation error:", error);
      storeRef.current.fail(
        toSend.map((item) => item.id),
        "Translation failed",
      );
      forceUpdate();
    }
  }, [enabled, targetLanguage, translateMutation]);

  // セグメントを翻訳キューに追加
  const queueTranslation = useCallback(
    (segment: TranscriptSegment) => {
      if (!enabled || !segment.text.trim()) return;

      pendingQueueRef.current.push({ id: segment.id, text: segment.text });

      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
      batchTimerRef.current = setTimeout(executeBatchTranslation, batchDelayMs);
    },
    [enabled, batchDelayMs, executeBatchTranslation],
  );

  // Debounced翻訳 (partialテキスト用)
  const translatePartial = useCallback(
    (segment: TranscriptSegment) => {
      if (!enabled) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        queueTranslation(segment);
      }, debounceMs);
    },
    [enabled, debounceMs, queueTranslation],
  );

  // 即座に翻訳 (committedテキスト用)
  const translateCommitted = useCallback(
    (segment: TranscriptSegment) => {
      if (!enabled) return;
      // 直前のpartialのdebounceが残っていると古いテキストで上書きされうるためクリア
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      queueTranslation(segment);
    },
    [enabled, queueTranslation],
  );

  // セグメントの翻訳テキストを取得
  const getTranslation = useCallback(
    (segmentId: string): string | undefined =>
      storeRef.current.getTranslation(segmentId),
    [],
  );

  // セグメントの翻訳ステータスを取得
  const getTranslationStatus = useCallback(
    (segmentId: string): TranslationStatus | undefined =>
      storeRef.current.getStatus(segmentId),
    [],
  );

  // キャッシュ・状態クリア
  const clearCache = useCallback(() => {
    storeRef.current.clear();
    forceUpdate();
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, []);

  // targetLanguageが変わったらキャッシュをクリア
  useEffect(() => {
    clearCache();
  }, [targetLanguage, clearCache]);

  return {
    translatePartial,
    translateCommitted,
    getTranslation,
    getTranslationStatus,
    clearCache,
    isTranslating: storeRef.current.isTranslating,
    translations: storeRef.current.snapshot(),
  };
}
