/**
 * PCM WAV 分割ユーティリティ
 *
 * tRPC 経由の同期アップロードは AWS Lambda のペイロード上限（~6MB）に
 * 引っかかるため、長時間録音（16kHz/16bit/mono で約110秒超）の WAV を
 * 複数の小さな WAV に分割して逐次送信するために使う。
 */

export const MAX_WAV_PAYLOAD_BYTES = 3 * 1024 * 1024; // base64化で約4MB（6MB上限に余裕を持たせる）

const WAV_HEADER_BYTES = 44;

interface WavFormat {
  /** data チャンクの先頭オフセット */
  dataOffset: number;
  /** PCM データ長 */
  dataLength: number;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  blockAlign: number;
}

function readTag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/**
 * RIFF/WAVE ヘッダを解析して PCM データの位置とフォーマットを返す。
 * PCM (audioFormat=1) 以外や不正なヘッダの場合は null。
 */
function parseWav(bytes: Uint8Array): WavFormat | null {
  if (bytes.length < WAV_HEADER_BYTES) return null;
  if (readTag(bytes, 0) !== "RIFF" || readTag(bytes, 8) !== "WAVE") return null;

  let offset = 12;
  let fmt: { sampleRate: number; numChannels: number; bitsPerSample: number; blockAlign: number } | null = null;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= bytes.length) {
    const tag = readTag(bytes, offset);
    const size = readU32(bytes, offset + 4);
    if (tag === "fmt ") {
      if (readU16(bytes, offset + 8) !== 1) return null; // PCM 以外は未対応
      fmt = {
        numChannels: readU16(bytes, offset + 10),
        sampleRate: readU32(bytes, offset + 12),
        blockAlign: readU16(bytes, offset + 20),
        bitsPerSample: readU16(bytes, offset + 22),
      };
    } else if (tag === "data") {
      dataOffset = offset + 8;
      dataLength = Math.min(size, bytes.length - dataOffset);
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (!fmt || dataOffset < 0) return null;
  return { dataOffset, dataLength, ...fmt };
}

function writeWavHeader(bytes: Uint8Array, dataLength: number, fmt: WavFormat): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, WAV_HEADER_BYTES);
  const byteRate = fmt.sampleRate * fmt.blockAlign;

  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataLength, true);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, fmt.numChannels, true);
  view.setUint32(24, fmt.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, fmt.blockAlign, true);
  view.setUint16(34, fmt.bitsPerSample, true);
  bytes.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataLength, true);
}

function bytesToBase64(bytes: Uint8Array): string {
  // String.fromCharCode(...args) は巨大配列でスタックが溢れるためブロック単位で変換
  const block = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += block) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + block)));
  }
  return btoa(parts.join(""));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Base64 エンコード済みの PCM WAV を、data チャンクが maxPayloadBytes を
 * 超えない複数の WAV（それぞれ有効なヘッダ付き）の Base64 配列へ分割する。
 * 分割不要・非 WAV・非 PCM の場合は null を返す（呼び出し側は従来処理へ）。
 */
export function splitWavBase64(wavBase64: string, maxPayloadBytes = MAX_WAV_PAYLOAD_BYTES): string[] | null {
  const bytes = base64ToBytes(wavBase64);
  const fmt = parseWav(bytes);
  if (!fmt || fmt.blockAlign <= 0) return null;
  if (fmt.dataLength <= maxPayloadBytes) return null;

  // フレーム境界に揃える
  const chunkSize = maxPayloadBytes - (maxPayloadBytes % fmt.blockAlign);
  const chunkCount = Math.ceil(fmt.dataLength / chunkSize);
  const chunks: string[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const start = fmt.dataOffset + i * chunkSize;
    const length = Math.min(chunkSize, fmt.dataOffset + fmt.dataLength - start);
    const out = new Uint8Array(WAV_HEADER_BYTES + length);
    writeWavHeader(out, length, fmt);
    out.set(bytes.subarray(start, start + length), WAV_HEADER_BYTES);
    chunks.push(bytesToBase64(out));
  }

  return chunks;
}
