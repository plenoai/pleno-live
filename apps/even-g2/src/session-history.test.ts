import { describe, expect, it } from "vitest";

import type { TranscriptionSnapshot } from "./transcription-session";
import { archiveSnapshot } from "./session-history";

function snapshot(
  overrides: Partial<TranscriptionSnapshot> = {},
): TranscriptionSnapshot {
  return {
    status: "connected",
    elapsedMs: 2_000,
    segments: [],
    finalText: "",
    partialText: "",
    fullText: "",
    displayText: "",
    ...overrides,
  };
}

describe("archiveSnapshot", () => {
  it("preserves committed and trailing partial text as final history", () => {
    const archived = archiveSnapshot(
      [
        {
          id: "older",
          text: "以前",
          isPartial: false,
          timestamp: 1,
        },
      ],
      10_000,
      snapshot({
        segments: [
          {
            id: "committed",
            text: "確定済み",
            isPartial: false,
            timestamp: 0.5,
          },
          {
            id: "partial",
            text: "停止直前",
            isPartial: true,
            timestamp: 1.5,
          },
        ],
      }),
      true,
    );

    expect(archived).toEqual({
      elapsedMs: 12_000,
      providerFailed: false,
      segments: [
        {
          id: "older",
          text: "以前",
          isPartial: false,
          timestamp: 1,
        },
        {
          id: "committed",
          text: "確定済み",
          isPartial: false,
          timestamp: 10.5,
        },
        {
          id: "partial",
          text: "停止直前",
          isPartial: false,
          timestamp: 11.5,
        },
      ],
    });
  });

  it("captures a provider failure before stopping clears session status", () => {
    const archived = archiveSnapshot(
      [],
      0,
      snapshot({ status: "error", error: "connection closed" }),
      false,
    );

    expect(archived.providerFailed).toBe(true);
    expect(archived.segments).toEqual([]);
    expect(archived.elapsedMs).toBe(0);
  });
});
