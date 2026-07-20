const DISPLAY_TEXT_LIMIT = 320;
const METER_LENGTH = 8;
const METER_GLYPHS = "▁▂▃▄▅▆▇█";

export type G2ScreenState =
  "connecting" | "ready" | "listening" | "paused" | "error";

export interface G2ScreenSnapshot {
  state: G2ScreenState;
  elapsedMs: number;
  transcript: string;
  meter: string;
  error?: string;
}

function formatElapsed(elapsedMs: number): string {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function stateLine(snapshot: G2ScreenSnapshot): string {
  switch (snapshot.state) {
    case "connecting":
      return "○ 接続中";
    case "ready":
      return "○ 準備完了";
    case "listening":
      return `● 録音中 ${formatElapsed(snapshot.elapsedMs)}  ${snapshot.meter}`;
    case "paused":
      return `■ 一時停止 ${formatElapsed(snapshot.elapsedMs)}`;
    case "error":
      return "▲ 接続エラー";
  }
}

function body(snapshot: G2ScreenSnapshot): string {
  if (snapshot.state === "error") {
    return (
      snapshot.error ||
      "スマートフォン側を確認し、タップして再試行してください。"
    );
  }
  if (snapshot.transcript.trim()) {
    return snapshot.transcript.trim().slice(-DISPLAY_TEXT_LIMIT);
  }
  if (snapshot.state === "connecting") {
    return "文字起こしを準備しています…";
  }
  if (snapshot.state === "listening") {
    return "話し始めると文字起こしを表示します…";
  }
  return "タップして文字起こしを開始してください。";
}

export function formatG2Screen(snapshot: G2ScreenSnapshot): string {
  const action =
    snapshot.state === "listening"
      ? "タップ: 一時停止"
      : snapshot.state === "connecting"
        ? "そのままお待ちください"
        : snapshot.state === "error"
          ? "タップ: 再試行"
          : "タップ: 開始";

  return [
    "PLENO LIVE",
    stateLine(snapshot),
    "────────────",
    body(snapshot),
    "",
    `${action}  ·  ダブルタップ: 終了`,
  ].join("\n");
}

export class PcmLevelMeter {
  private readonly levels = Array<number>(METER_LENGTH).fill(0);

  push(pcm: Uint8Array): string {
    const sampleCount = Math.floor(pcm.byteLength / 2);
    if (sampleCount === 0) {
      return this.render();
    }

    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const stride = Math.max(1, Math.floor(sampleCount / 160));
    let sumSquares = 0;
    let measured = 0;

    for (let sample = 0; sample < sampleCount; sample += stride) {
      const amplitude = view.getInt16(sample * 2, true);
      sumSquares += amplitude * amplitude;
      measured += 1;
    }

    const rms = Math.sqrt(sumSquares / measured);
    const level = Math.min(METER_GLYPHS.length - 1, Math.floor(rms / 3_500));
    this.levels.shift();
    this.levels.push(level);
    return this.render();
  }

  render(): string {
    return this.levels.map((level) => METER_GLYPHS[level]).join("");
  }
}
