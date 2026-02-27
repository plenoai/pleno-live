/**
 * リアルタイム文字起こしの自動refinementフック
 *
 * committedセグメントがthreshold件溜まるごとにGeminiで校正し、
 * 元テキストを上書きして返す。意味・内容は変えず読みやすさのみ改善。
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/packages/lib/trpc";
import type { TranscriptSegment } from "@/packages/types/realtime-transcription";

/** committed N件ごとにrefinementを実行（デフォルト推奨値） */
export const DEFAULT_REFINEMENT_THRESHOLD = 3;

/**
 * Refinement済みグループ: 元セグメントIDのリストと校正後テキスト
 */
interface RefinedGroup {
  /** グループの先頭セグメントID（表示キーとして使用） */
  headId: string;
  /** このグループに含まれる全セグメントID */
  ids: string[];
  /** Geminiで校正したテキスト */
  refinedText: string;
  /** 話者（先頭セグメントから引き継ぐ） */
  speaker?: string;
}

/**
 * @param mergedSegments - useRealtimeTranscription から得られた mergedSegments
 * @param threshold - refinementを発動するcommittedセグメント数（デフォルト: 3）
 * @returns refinement適用済みのセグメント配列（表示用）
 */
export function useTranscriptRefinement(
  mergedSegments: TranscriptSegment[],
  threshold: number = DEFAULT_REFINEMENT_THRESHOLD,
): TranscriptSegment[] {
  const [refinedGroups, setRefinedGroups] = useState<RefinedGroup[]>([]);

  // 処理済みセグメントIDセット（重複実行防止）
  const submittedIdsRef = useRef<Set<string>>(new Set());

  const refineMutation = trpc.ai.refineTranscript.useMutation();

  useEffect(() => {
    const committed = mergedSegments.filter(s => !s.isPartial);
    const pending = committed.filter(s => !submittedIdsRef.current.has(s.id));

    if (pending.length < threshold) return;

    // threshold件ずつバッチ処理（複数バッチが溜まっている場合は1回だけ実行）
    const batch = pending.slice(0, threshold);
    batch.forEach(s => submittedIdsRef.current.add(s.id));

    refineMutation.mutateAsync({
      segments: batch.map(s => ({
        id: s.id,
        text: s.text,
        speaker: s.speaker,
      })),
    }).then(({ refined, originalIds }) => {
      setRefinedGroups(prev => [
        ...prev,
        {
          headId: originalIds[0],
          ids: originalIds,
          refinedText: refined,
          speaker: batch[0].speaker,
        },
      ]);
    }).catch(err => {
      // エラー時は元テキストをそのまま表示するため、submittedIds は維持
      console.warn("[useTranscriptRefinement] refinement failed, showing original:", err);
    });
  }, [mergedSegments, threshold]);

  /**
   * refinedGroupsを適用した表示用セグメント配列を返す。
   * refinement済みのグループは先頭IDのセグメントに校正テキストを置き換え、
   * 残りのセグメントはスキップする。
   */
  return useMemo(() => {
    if (refinedGroups.length === 0) return mergedSegments;

    // refinement済みIDセット（グループ内の2番目以降をスキップするために使用）
    const refinedIdMap = new Map<string, RefinedGroup>();
    const skippedIds = new Set<string>();

    for (const group of refinedGroups) {
      refinedIdMap.set(group.headId, group);
      group.ids.slice(1).forEach(id => skippedIds.add(id));
    }

    const result: TranscriptSegment[] = [];

    for (const segment of mergedSegments) {
      if (skippedIds.has(segment.id)) continue;

      const group = refinedIdMap.get(segment.id);
      if (group) {
        result.push({
          ...segment,
          text: group.refinedText,
          speaker: group.speaker,
        });
      } else {
        result.push(segment);
      }
    }

    return result;
  }, [mergedSegments, refinedGroups]);
}
