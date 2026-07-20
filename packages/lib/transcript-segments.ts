/**
 * リアルタイム文字起こしセグメントの純粋な変換ロジック
 *
 * ElevenLabs Realtime の partial / committed イベントを
 * セグメント配列に反映するための副作用のない関数群。
 * Reactフックから切り離して単体テスト可能にしている。
 *
 * 設計の要点（翻訳消失バグ対策）:
 * - partial → committed の変換時、テキストが多少変化しても
 *   元のpartialセグメントを **in-place** で確定に変換し、IDを維持する。
 *   こうすることで、partial時に算出済みの翻訳（segment.id をキーに保持）が
 *   確定後もそのまま引き継がれ、確定の瞬間に翻訳が消えない。
 * - 孤児のpartialセグメントを残さない。
 */

import type { TranscriptSegment } from "@/packages/types/realtime-transcription";

type IdGenerator = () => string;

export interface SegmentUpdate {
  /** 更新後のセグメント配列 */
  segments: TranscriptSegment[];
  /** 今回追加・更新されたセグメント（コールバック連携用） */
  segment: TranscriptSegment;
}

/**
 * partial（途中結果）を反映する。
 * 最後がpartialならテキストを更新（ID維持）、そうでなければ新規partialを追加。
 */
export function applyPartial(
  segments: TranscriptSegment[],
  text: string,
  timestamp: number,
  idGen: IdGenerator,
): SegmentUpdate {
  const last = segments[segments.length - 1];

  if (last?.isPartial) {
    const segment: TranscriptSegment = { ...last, text, timestamp };
    return { segments: [...segments.slice(0, -1), segment], segment };
  }

  const segment: TranscriptSegment = {
    id: idGen(),
    text,
    isPartial: true,
    timestamp,
  };
  return { segments: [...segments, segment], segment };
}

/**
 * committed（確定結果）を反映する。
 *
 * 優先順位:
 * 1. 直前がpartial → テキストが異なっても in-place で確定に変換（ID維持）
 * 2. それ以外 → 新規committedを追加
 *
 * @param speaker 話者ID（diarization。未指定なら既存値を維持）
 */
export function applyCommitted(
  segments: TranscriptSegment[],
  text: string,
  timestamp: number,
  speaker: string | undefined,
  idGen: IdGenerator,
): SegmentUpdate {
  const last = segments[segments.length - 1];

  // 1. 直前がpartial: テキストが変化していても in-place で確定化（ID維持）
  if (last?.isPartial) {
    const segment: TranscriptSegment = {
      ...last,
      text,
      isPartial: false,
      timestamp,
      speaker: speaker ?? last.speaker,
    };
    return { segments: [...segments.slice(0, -1), segment], segment };
  }

  // 2. 新規committed
  const segment: TranscriptSegment = {
    id: idGen(),
    text,
    isPartial: false,
    timestamp,
    speaker,
  };
  return { segments: [...segments, segment], segment };
}

/**
 * committed_transcript の直後に届く timestamps 版を同じセグメントへ反映する。
 */
export function applyTimestampedCommitted(
  segments: TranscriptSegment[],
  text: string,
  timestamp: number,
  speaker: string | undefined,
  idGen: IdGenerator,
): SegmentUpdate {
  const last = segments[segments.length - 1];
  if (last && !last.isPartial && last.text === text) {
    const segment: TranscriptSegment = {
      ...last,
      speaker: speaker ?? last.speaker,
    };
    return { segments: [...segments.slice(0, -1), segment], segment };
  }

  return applyCommitted(segments, text, timestamp, speaker, idGen);
}

/**
 * 表示用にセグメントを結合する。
 * 同じ話者（または両方話者なし）の連続committedを空白で結合し、
 * 構成元の全セグメントIDを `sourceIds` に保持する。
 *
 * `sourceIds` を保持することで、表示側は結合された各セグメントの翻訳を
 * すべて引き当てて連結でき、結合によって翻訳が欠落しない。
 */
export function mergeSegments(
  segments: TranscriptSegment[],
): TranscriptSegment[] {
  const merged: TranscriptSegment[] = [];

  for (const segment of segments) {
    const last = merged[merged.length - 1];

    if (
      last &&
      !last.isPartial &&
      !segment.isPartial &&
      last.speaker === segment.speaker
    ) {
      merged[merged.length - 1] = {
        ...last,
        text: `${last.text} ${segment.text}`,
        timestamp: segment.timestamp,
        sourceIds: [...(last.sourceIds ?? [last.id]), segment.id],
      };
    } else {
      merged.push({ ...segment, sourceIds: [segment.id] });
    }
  }

  return merged;
}
