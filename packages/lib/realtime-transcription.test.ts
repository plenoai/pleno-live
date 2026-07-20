import { afterEach, describe, expect, it, vi } from "vitest";

import { RealtimeTranscriptionClient } from "./realtime-transcription";

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RealtimeTranscriptionClient", () => {
  it("uses the current Scribe v2 protocol and waits for the server ack", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const client = new RealtimeTranscriptionClient();
    let connected = false;

    const connecting = client
      .connect("single-use", {
        languageCode: "ja",
        vad: { silenceThresholdSecs: 0.5, minSpeechDurationMs: 250 },
      })
      .then(() => {
        connected = true;
      });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await Promise.resolve();

    expect(connected).toBe(false);
    const url = new URL(socket.url);
    expect(url.searchParams.get("model_id")).toBe("scribe_v2_realtime");
    expect(url.searchParams.get("audio_format")).toBe("pcm_16000");
    expect(url.searchParams.get("commit_strategy")).toBe("vad");
    expect(url.searchParams.get("min_speech_duration_ms")).toBe("250");
    expect(url.searchParams.has("diarize")).toBe(false);
    expect(url.searchParams.has("vad_min_speech_duration_secs")).toBe(false);

    socket.receive({ message_type: "session_started", session_id: "session" });
    await connecting;

    expect(connected).toBe(true);
    expect(client.isConnected).toBe(true);
  });

  it("sends VAD audio without a manual commit and surfaces typed server errors", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = new RealtimeTranscriptionClient();
    const errors: unknown[] = [];
    client.on("error", (error) => errors.push(error));

    const connecting = client.connect("single-use");
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({ message_type: "session_started" });
    await connecting;

    client.sendAudioChunk("AAEC/w==", 16_000);
    expect(JSON.parse(socket.sent[0])).toEqual({
      message_type: "input_audio_chunk",
      audio_base_64: "AAEC/w==",
      sample_rate: 16_000,
    });

    socket.receive({
      message_type: "rate_limited",
      error: "Please retry",
    });
    expect(errors).toContainEqual({
      code: "rate_limited",
      message: "Please retry",
    });

    socket.receive({
      message_type: "input_error",
      error: "Invalid audio chunk",
    });
    expect(errors).toContainEqual({
      code: "input_error",
      message: "Invalid audio chunk",
    });
  });

  it.each([
    "auth_error",
    "quota_exceeded",
    "transcriber_error",
    "input_error",
    "error",
    "commit_throttled",
    "unaccepted_terms",
    "rate_limited",
    "queue_overflow",
    "resource_exhausted",
    "session_time_limit_exceeded",
    "chunk_size_exceeded",
    "insufficient_audio_activity",
  ])("rejects %s before session acknowledgement", async (messageType) => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = new RealtimeTranscriptionClient();

    const connecting = client.connect("single-use");
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({
      message_type: messageType,
      error: "Provider rejected the session",
    });

    await expect(connecting).rejects.toThrow("Provider rejected the session");
    expect(client.isConnected).toBe(false);
  });
});
