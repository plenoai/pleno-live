import { describe, expect, it } from "vitest";

import { formatG2Screen, PcmLevelMeter } from "./glasses-view";

describe("formatG2Screen", () => {
  it("renders the required root-page controls", () => {
    const screen = formatG2Screen({
      state: "listening",
      elapsedMs: 65_000,
      transcript: "A concise transcript",
      meter: "▁▂▃▄▅▆▇█",
    });

    expect(screen).toContain("● 録音中 01:05");
    expect(screen).toContain("A concise transcript");
    expect(screen).toContain("ダブルタップ: 終了");
  });

  it("bounds transcript text for the glasses canvas", () => {
    const transcript = "x".repeat(400);
    const screen = formatG2Screen({
      state: "paused",
      elapsedMs: 0,
      transcript,
      meter: "",
    });

    expect(screen).not.toContain(transcript);
    expect(screen.match(/x/g)).toHaveLength(320);
  });
});

describe("PcmLevelMeter", () => {
  it("keeps silence at the lowest level and raises the latest loud sample", () => {
    const meter = new PcmLevelMeter();
    expect(meter.push(new Uint8Array(320))).toBe("▁▁▁▁▁▁▁▁");

    const loud = new Uint8Array(320);
    const view = new DataView(loud.buffer);
    for (let offset = 0; offset < loud.byteLength; offset += 2) {
      view.setInt16(offset, 30_000, true);
    }

    expect(meter.push(loud)).toBe("▁▁▁▁▁▁▁█");
  });
});
