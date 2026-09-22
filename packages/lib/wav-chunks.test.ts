import { describe, expect, it } from "vitest";

import { splitWavBase64 } from "./wav-chunks";

function buildWav(payloadBytes: number): Uint8Array {
  const data = new Uint8Array(payloadBytes);
  for (let i = 0; i < payloadBytes; i++) data[i] = i % 256;

  const wav = new Uint8Array(44 + payloadBytes);
  const view = new DataView(wav.buffer);
  wav.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 36 + payloadBytes, true);
  wav.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  wav.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true); // blockAlign
  view.setUint16(34, 16, true); // bitsPerSample
  wav.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, payloadBytes, true);
  wav.set(data, 44);
  return wav;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe("splitWavBase64", () => {
  it("returns null for a WAV under the limit", () => {
    expect(splitWavBase64(toBase64(buildWav(1000)), 4096)).toBeNull();
  });

  it("returns null for non-WAV input", () => {
    expect(splitWavBase64(toBase64(new Uint8Array([1, 2, 3, 4])), 4096)).toBeNull();
  });

  it("splits an oversized WAV into valid WAV chunks preserving PCM data", () => {
    const payload = 10_000;
    const wav = buildWav(payload);
    const chunks = splitWavBase64(toBase64(wav), 3000)!;

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBe(Math.ceil(payload / 3000));

    const merged = chunks!.flatMap((chunk) => {
      const bytes = fromBase64(chunk);
      // 各チャンクが有効な WAV ヘッダを持つ
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
      expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe("WAVE");
      const view = new DataView(bytes.buffer);
      expect(view.getUint32(40, true)).toBe(bytes.length - 44);
      return Array.from(bytes.subarray(44));
    });

    expect(merged).toEqual(Array.from(wav.subarray(44)));
  });
});
