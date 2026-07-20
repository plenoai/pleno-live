import { describe, expect, it, vi } from "vitest";

import type { RealtimeOptions } from "../../../packages/types/realtime-transcription";
import type { RealtimeEvent } from "../../../packages/lib/realtime-transcription";

import {
  TranscriptionSession,
  type TranscriptionClient,
  type TranscriptionSessionStatus,
  type TranscriptionSnapshot,
} from "./transcription-session";

class FakeTranscriptionClient implements TranscriptionClient {
  readonly connectCalls: Array<{ token: string; options?: RealtimeOptions }> =
    [];
  readonly sentAudio: Array<{ base64: string; sampleRate?: number }> = [];
  readonly handlers = new Map<RealtimeEvent, (data: unknown) => void>();
  disconnectCalls = 0;
  connected = false;

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(token: string, options?: RealtimeOptions): Promise<void> {
    this.connectCalls.push({ token, options });
    this.connected = true;
    this.emit("session_started", {});
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.connected = false;
  }

  sendAudioChunk(base64: string, sampleRate?: number): void {
    this.sentAudio.push({ base64, sampleRate });
  }

  on(event: RealtimeEvent, handler: (data: unknown) => void): void {
    this.handlers.set(event, handler);
  }

  emit(event: RealtimeEvent, data: unknown = {}): void {
    if (event === "close") {
      this.connected = false;
    }
    this.handlers.get(event)?.(data);
  }
}

function createHarness(tokenProvider = vi.fn(async () => "single-use-token")) {
  const client = new FakeTranscriptionClient();
  const statuses: TranscriptionSessionStatus[] = [];
  const snapshots: TranscriptionSnapshot[] = [];
  const errors: Error[] = [];
  let nowMs = 1_000;
  let id = 0;

  const session = new TranscriptionSession({
    tokenProvider,
    clientFactory: () => client,
    now: () => nowMs,
    idGenerator: () => `segment-${++id}`,
    onStatus: (status) => statuses.push(status),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onError: (error) => errors.push(error),
  });

  return {
    client,
    errors,
    session,
    snapshots,
    statuses,
    tokenProvider,
    setNow(value: number) {
      nowMs = value;
    },
  };
}

describe("TranscriptionSession", () => {
  it("gets the injected token and opens the realtime client", async () => {
    const harness = createHarness();

    await harness.session.start({ languageCode: "en" });

    expect(harness.tokenProvider).toHaveBeenCalledOnce();
    expect(harness.client.connectCalls).toEqual([
      { token: "single-use-token", options: { languageCode: "en" } },
    ]);
    expect(harness.statuses).toEqual(["connecting", "connected"]);
    expect(harness.session.getSnapshot().status).toBe("connected");
  });

  it("starts elapsed time only after the token and realtime session are ready", async () => {
    let resolveToken: ((token: string) => void) | undefined;
    const tokenProvider = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        }),
    );
    const harness = createHarness(tokenProvider);

    const starting = harness.session.start();
    harness.setNow(5_000);
    resolveToken?.("single-use-token");
    await starting;

    expect(harness.session.getSnapshot().elapsedMs).toBe(0);
    harness.setNow(5_500);
    expect(harness.session.getSnapshot().elapsedMs).toBe(500);
  });

  it("base64-encodes G2 PCM and always sends it at 16 kHz", async () => {
    const harness = createHarness();

    expect(harness.session.sendPcm(new Uint8Array([0, 1]))).toBe(false);
    await harness.session.start();

    expect(harness.session.sendPcm(new Uint8Array([0, 1, 2, 255]))).toBe(true);
    expect(harness.client.sentAudio).toEqual([
      { base64: "AAEC/w==", sampleRate: 16_000 },
    ]);
  });

  it("keeps finals while replacing only the current partial", async () => {
    const harness = createHarness();
    await harness.session.start();

    harness.setNow(1_250);
    harness.client.emit("partial", { text: "hello" });
    harness.setNow(1_500);
    harness.client.emit("committed", { text: "hello." });
    harness.client.emit("committedWithTimestamps", {
      text: "hello.",
      words: [{ speaker_id: "speaker-1" }],
    });
    harness.setNow(1_750);
    harness.client.emit("partial", { text: "next" });
    harness.client.emit("partial", { text: "next phrase" });

    const snapshot = harness.session.getSnapshot();
    expect(snapshot.segments).toEqual([
      {
        id: "segment-1",
        text: "hello.",
        isPartial: false,
        timestamp: 0.5,
        speaker: "speaker-1",
      },
      {
        id: "segment-2",
        text: "next phrase",
        isPartial: true,
        timestamp: 0.75,
      },
    ]);
    expect(snapshot.finalText).toBe("hello.");
    expect(snapshot.partialText).toBe("next phrase");
    expect(snapshot.fullText).toBe("hello. next phrase");
    expect(harness.snapshots.at(-1)).toEqual(snapshot);
  });

  it("limits only display text while preserving the full transcript", async () => {
    const harness = createHarness();
    const text = "x".repeat(450);
    await harness.session.start();

    harness.client.emit("committed", { text });

    const snapshot = harness.session.getSnapshot();
    expect(snapshot.fullText).toBe(text);
    expect(snapshot.segments[0].text).toBe(text);
    expect(snapshot.displayText).toBe(text.slice(-400));
    expect(snapshot.displayText).toHaveLength(400);
  });

  it("reports an unexpected disconnect and never queues later audio", async () => {
    const harness = createHarness();
    await harness.session.start();

    harness.client.emit("close");

    expect(harness.session.status).toBe("error");
    expect(harness.statuses.at(-1)).toBe("error");
    expect(harness.errors).toHaveLength(1);
    expect(harness.errors[0].message).toBe(
      "Realtime transcription connection closed unexpectedly",
    );
    expect(harness.session.sendPcm(new Uint8Array([1]))).toBe(false);
    expect(harness.session.sendPcm(new Uint8Array([2]))).toBe(false);
    expect(harness.client.sentAudio).toEqual([]);
    expect(harness.errors).toHaveLength(1);
  });

  it("surfaces provider errors with their original message", async () => {
    const harness = createHarness();
    await harness.session.start();

    harness.client.emit("error", { message: "Invalid audio chunk" });

    expect(harness.session.getSnapshot()).toMatchObject({
      status: "error",
      error: "Invalid audio chunk",
    });
    expect(harness.client.disconnectCalls).toBe(1);
    expect(harness.errors.map((error) => error.message)).toEqual([
      "Invalid audio chunk",
    ]);
  });

  it("stops intentionally without reporting a disconnect error", async () => {
    const harness = createHarness();
    await harness.session.start();
    harness.setNow(2_000);

    harness.session.stop();

    expect(harness.session.getSnapshot()).toMatchObject({
      status: "disconnected",
      elapsedMs: 1_000,
      error: undefined,
    });
    expect(harness.client.disconnectCalls).toBe(1);
    expect(harness.errors).toEqual([]);
    expect(harness.session.sendPcm(new Uint8Array([1]))).toBe(false);
  });

  it("surfaces token failures without constructing a client", async () => {
    const tokenProvider = vi.fn(async () => {
      throw new Error("token unavailable");
    });
    const harness = createHarness(tokenProvider);

    await expect(harness.session.start()).rejects.toThrow("token unavailable");

    expect(harness.client.connectCalls).toEqual([]);
    expect(harness.session.getSnapshot()).toMatchObject({
      status: "error",
      error: "token unavailable",
    });
    expect(harness.errors.map((error) => error.message)).toEqual([
      "token unavailable",
    ]);
  });

  it("does not connect when stopped while the token is pending", async () => {
    let resolveToken: ((token: string) => void) | undefined;
    const tokenProvider = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        }),
    );
    const harness = createHarness(tokenProvider);

    const starting = harness.session.start();
    harness.session.stop();
    resolveToken?.("too-late");
    await starting;

    expect(harness.client.connectCalls).toEqual([]);
    expect(harness.session.status).toBe("disconnected");
    expect(harness.errors).toEqual([]);
  });
});
