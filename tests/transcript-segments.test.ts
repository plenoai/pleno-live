import { describe, it, expect } from "vitest";
import {
  applyPartial,
  applyCommitted,
  mergeSegments,
} from "../packages/lib/transcript-segments";
import type { TranscriptSegment } from "../packages/types/realtime-transcription";

// テスト用の決定的なID生成器
function makeIdGen() {
  let n = 0;
  return () => `id-${++n}`;
}

describe("applyPartial", () => {
  it("空配列に最初のpartialを追加する", () => {
    const idGen = makeIdGen();
    const { segments, segment } = applyPartial([], "こんにち", 1.0, idGen);

    expect(segments).toHaveLength(1);
    expect(segment.text).toBe("こんにち");
    expect(segment.isPartial).toBe(true);
    expect(segment.id).toBe("id-1");
  });

  it("最後がpartialならテキストを更新しIDを維持する", () => {
    const idGen = makeIdGen();
    const first = applyPartial([], "こんにち", 1.0, idGen);
    const second = applyPartial(first.segments, "こんにちは", 1.2, idGen);

    expect(second.segments).toHaveLength(1);
    expect(second.segment.id).toBe("id-1"); // 同じID
    expect(second.segment.text).toBe("こんにちは");
  });

  it("最後がcommittedなら新しいpartialを追加する", () => {
    const idGen = makeIdGen();
    const committed: TranscriptSegment[] = [
      { id: "c1", text: "確定済み", isPartial: false, timestamp: 0 },
    ];
    const { segments, segment } = applyPartial(committed, "次の", 2.0, idGen);

    expect(segments).toHaveLength(2);
    expect(segment.isPartial).toBe(true);
  });
});

describe("applyCommitted", () => {
  it("最後のpartialをテキストが異なってもin-placeでcommittedに変換しIDを維持する（翻訳消失バグ回帰）", () => {
    const idGen = makeIdGen();
    const partial = applyPartial([], "こんにちは世界", 1.0, idGen);

    // 確定テキストは句読点付きで異なる
    const { segments, segment } = applyCommitted(
      partial.segments,
      "こんにちは世界。",
      1.5,
      undefined,
      idGen,
    );

    expect(segments).toHaveLength(1); // 孤児のpartialを残さない
    expect(segment.id).toBe("id-1"); // 元のpartialと同じID
    expect(segment.isPartial).toBe(false);
    expect(segment.text).toBe("こんにちは世界。");
  });

  it("最後が同テキストのcommittedなら話者情報のみ更新しIDを維持する", () => {
    const idGen = makeIdGen();
    const committed: TranscriptSegment[] = [
      { id: "c1", text: "確定済み", isPartial: false, timestamp: 0 },
    ];
    const { segments, segment } = applyCommitted(
      committed,
      "確定済み",
      0,
      "speaker_1",
      idGen,
    );

    expect(segments).toHaveLength(1);
    expect(segment.id).toBe("c1");
    expect(segment.speaker).toBe("speaker_1");
  });

  it("最後がcommittedで別テキストなら新しいcommittedを追加する", () => {
    const idGen = makeIdGen();
    const committed: TranscriptSegment[] = [
      { id: "c1", text: "最初の発話", isPartial: false, timestamp: 0 },
    ];
    const { segments, segment } = applyCommitted(
      committed,
      "次の発話",
      2.0,
      undefined,
      idGen,
    );

    expect(segments).toHaveLength(2);
    expect(segment.id).toBe("id-1");
    expect(segment.isPartial).toBe(false);
  });

  it("partialが無くてもcommittedを追加できる", () => {
    const idGen = makeIdGen();
    const { segments, segment } = applyCommitted([], "確定", 1.0, "spk", idGen);
    expect(segments).toHaveLength(1);
    expect(segment.isPartial).toBe(false);
    expect(segment.speaker).toBe("spk");
  });
});

describe("mergeSegments", () => {
  it("同じ話者の連続committedを結合し、全構成IDをsourceIdsで保持する", () => {
    const segments: TranscriptSegment[] = [
      { id: "a", text: "おはよう", isPartial: false, timestamp: 0, speaker: "s1" },
      { id: "b", text: "ございます", isPartial: false, timestamp: 1, speaker: "s1" },
    ];
    const merged = mergeSegments(segments);

    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("おはよう ございます");
    expect(merged[0].sourceIds).toEqual(["a", "b"]);
  });

  it("話者が異なる場合は結合しない", () => {
    const segments: TranscriptSegment[] = [
      { id: "a", text: "A", isPartial: false, timestamp: 0, speaker: "s1" },
      { id: "b", text: "B", isPartial: false, timestamp: 1, speaker: "s2" },
    ];
    const merged = mergeSegments(segments);
    expect(merged).toHaveLength(2);
    expect(merged[0].sourceIds).toEqual(["a"]);
    expect(merged[1].sourceIds).toEqual(["b"]);
  });

  it("partialは結合せず単独で保持する", () => {
    const segments: TranscriptSegment[] = [
      { id: "a", text: "確定", isPartial: false, timestamp: 0, speaker: "s1" },
      { id: "b", text: "途中", isPartial: true, timestamp: 1, speaker: "s1" },
    ];
    const merged = mergeSegments(segments);
    expect(merged).toHaveLength(2);
    expect(merged[1].isPartial).toBe(true);
    expect(merged[1].sourceIds).toEqual(["b"]);
  });
});
