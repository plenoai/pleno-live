import type { TranscriptSegment } from "../../../packages/types/realtime-transcription";

import type { TranscriptionSnapshot } from "./transcription-session";

export interface SessionHistory {
  elapsedMs: number;
  providerFailed: boolean;
  segments: TranscriptSegment[];
}

export function archiveSnapshot(
  history: TranscriptSegment[],
  elapsedMs: number,
  snapshot: TranscriptionSnapshot,
  capturedAudio: boolean,
): SessionHistory {
  const providerFailed = snapshot.status === "error";
  if (snapshot.segments.length === 0 && !capturedAudio) {
    return { elapsedMs, providerFailed, segments: history };
  }

  const offsetSeconds = elapsedMs / 1_000;
  return {
    elapsedMs: elapsedMs + snapshot.elapsedMs,
    providerFailed,
    segments: [
      ...history,
      ...snapshot.segments.map((segment) => ({
        ...segment,
        isPartial: false,
        timestamp: segment.timestamp + offsetSeconds,
      })),
    ],
  };
}
