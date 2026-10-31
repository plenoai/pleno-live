import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  RealtimeClient,
  RealtimeEvent,
  RealtimeEventHandler,
} from "./realtime-client";
import {
  MAX_REALTIME_RECONNECT_ATTEMPTS,
  REALTIME_RECONNECT_DELAYS_MS,
  RealtimeTranscriptionSession,
} from "./realtime-session";

class FakeRealtimeClient implements RealtimeClient {
  private handlers = new Map<RealtimeEvent, RealtimeEventHandler>();
  private resolveConnect: (() => void) | null = null;
  private rejectConnect: ((error: Error) => void) | null = null;
  readonly tokens: string[] = [];
  readonly options: unknown[] = [];
  readonly sent: Array<{ audio: string; sampleRate: number }> = [];
  isConnected = false;

  connect(token: string, options?: unknown): Promise<void> {
    this.tokens.push(token);
    this.options.push(options);
    return new Promise((resolve, reject) => {
      this.resolveConnect = () => {
        this.isConnected = true;
        this.emit("session_started", {});
        this.resolveConnect = null;
        this.rejectConnect = null;
        resolve();
      };
      this.rejectConnect = (error) => {
        this.rejectConnect = null;
        this.resolveConnect = null;
        reject(error);
      };
    });
  }

  acknowledge(): void {
    this.resolveConnect?.();
  }

  failBeforeAck(message = "socket closed during handshake"): void {
    this.isConnected = false;
    const reject = this.rejectConnect;
    if (reject) reject(new Error(message));
    else this.emit("close", {});
  }

  closeRemotely(): void {
    this.isConnected = false;
    if (this.rejectConnect) this.failBeforeAck();
    else this.emit("close", {});
  }

  emit(event: RealtimeEvent, data: unknown): void {
    this.handlers.get(event)?.(data);
  }

  capture(event: RealtimeEvent): RealtimeEventHandler | undefined {
    return this.handlers.get(event);
  }

  sendAudioChunk(audio: string, sampleRate = 16000): void {
    this.sent.push({ audio, sampleRate });
  }

  disconnect(): void {
    this.isConnected = false;
    this.handlers.clear();
    this.rejectConnect?.(new Error("disconnected"));
  }

  on(event: RealtimeEvent, handler: RealtimeEventHandler): void {
    this.handlers.set(event, handler);
  }

  off(event: RealtimeEvent): void {
    this.handlers.delete(event);
  }
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function createSession() {
  const clients: FakeRealtimeClient[] = [];
  let tokenCount = 0;
  const onReconnectExhausted = vi.fn();
  const onError = vi.fn();
  const session = new RealtimeTranscriptionSession({
    provider: "elevenlabs",
    options: { provider: "elevenlabs", languageCode: "ja" },
    dependencies: {
      createClient: () => {
        const client = new FakeRealtimeClient();
        clients.push(client);
        return client;
      },
      requestToken: async () => `fresh-${++tokenCount}`,
    },
    handlers: { onReconnectExhausted, onError },
  });
  return {
    session,
    clients,
    onReconnectExhausted,
    onError,
    tokenCount: () => tokenCount,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RealtimeTranscriptionSession reconnect", () => {
  it("uses a fresh token and client, resumes audio, and ignores late events from the old socket", async () => {
    vi.useFakeTimers();
    const clients: FakeRealtimeClient[] = [];
    let tokenCount = 0;
    const partials: string[] = [];
    // This is the same lifecycle used by the hook; the microphone stream is not owned by reconnect.
    const liveSession = new RealtimeTranscriptionSession({
      provider: "elevenlabs",
      options: { provider: "elevenlabs", languageCode: "ja" },
      dependencies: {
        createClient: (provider) => {
          expect(provider).toBe("elevenlabs");
          const client = new FakeRealtimeClient();
          clients.push(client);
          return client;
        },
        requestToken: async () => `fresh-${++tokenCount}`,
      },
      handlers: { onPartial: ({ text }) => partials.push(text) },
    });
    const starting = liveSession.start();
    await flush();
    const first = clients[0];
    first.acknowledge();
    await starting;

    const lateClose = first.capture("close");
    first.closeRemotely();
    await vi.advanceTimersByTimeAsync(REALTIME_RECONNECT_DELAYS_MS[0]);
    await flush();
    const second = clients[1];
    expect(second.tokens).toEqual(["fresh-2"]);
    expect(second.options).toEqual([
      { provider: "elevenlabs", languageCode: "ja" },
    ]);
    second.acknowledge();
    liveSession.sendAudioChunk("next-audio", 16000);
    second.emit("partial", { text: "続き" });
    lateClose?.({});
    await vi.advanceTimersByTimeAsync(10_000);

    expect(tokenCount).toBe(2);
    expect(clients).toHaveLength(2);
    expect(liveSession.isConnected).toBe(true);
    expect(second.sent).toEqual([{ audio: "next-audio", sampleRate: 16000 }]);
    expect(partials).toEqual(["続き"]);
    await liveSession.stop(false);
  });

  it("expedites a pending reconnect when the session resumes", async () => {
    vi.useFakeTimers();
    const { session, clients, tokenCount } = createSession();
    const starting = session.start();
    await flush();
    clients[0].acknowledge();
    await starting;

    clients[0].closeRemotely();
    session.resume();
    await flush();

    expect(tokenCount()).toBe(2);
    expect(clients).toHaveLength(2);
    clients[1].acknowledge();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tokenCount()).toBe(2);
    await session.stop(false);
  });

  it("uses 1/2/4 second backoff and stops after three retries until the recording returns to the foreground", async () => {
    vi.useFakeTimers();
    const { session, clients, tokenCount, onReconnectExhausted } =
      createSession();
    const starting = session.start();
    await flush();
    clients[0].acknowledge();
    await starting;

    clients[0].closeRemotely();
    expect(tokenCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(REALTIME_RECONNECT_DELAYS_MS[0]);
    await flush();
    expect(clients).toHaveLength(2);
    clients[1].failBeforeAck();
    await flush();

    await vi.advanceTimersByTimeAsync(REALTIME_RECONNECT_DELAYS_MS[1]);
    await flush();
    expect(clients).toHaveLength(3);
    clients[2].failBeforeAck();
    await flush();

    await vi.advanceTimersByTimeAsync(REALTIME_RECONNECT_DELAYS_MS[2]);
    await flush();
    expect(clients).toHaveLength(4);
    clients[3].failBeforeAck();
    await flush();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(tokenCount()).toBe(1 + MAX_REALTIME_RECONNECT_ATTEMPTS);
    expect(onReconnectExhausted).toHaveBeenCalledOnce();
    expect(clients).toHaveLength(4);
    session.resume();
    session.resume();
    await flush();
    expect(tokenCount()).toBe(5);
    expect(clients).toHaveLength(5);
    clients[4].acknowledge();
    await flush();
    expect(session.isConnected).toBe(true);
    await session.stop(false);
  });

  it.each(["quota_exceeded", "insufficient_quota"])(
    "does not retry %s",
    async (code) => {
      vi.useFakeTimers();
      const { session, clients, tokenCount, onError } = createSession();
      const starting = session.start();
      await flush();
      clients[0].acknowledge();
      await starting;

      clients[0].emit("error", { code, message: "quota exhausted" });
      expect(session.isActive).toBe(false);
      expect(session.isTerminal).toBe(true);
      session.resume();
      await vi.advanceTimersByTimeAsync(20_000);

      expect(onError).toHaveBeenCalledWith({
        code,
        message: "quota exhausted",
      });
      expect(tokenCount()).toBe(1);
      expect(clients).toHaveLength(1);
      await session.stop(false);
    },
  );

  it("cancels a retry when stopped and does not connect after an in-flight token resolves", async () => {
    vi.useFakeTimers();
    const { session, clients, tokenCount } = createSession();
    const starting = session.start();
    await flush();
    clients[0].acknowledge();
    await starting;

    clients[0].closeRemotely();
    session.cancelReconnects();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tokenCount()).toBe(1);
    await session.stop(false);
    expect(tokenCount()).toBe(1);
    expect(clients).toHaveLength(1);

    let resolveToken!: (token: string) => void;
    const pending = new RealtimeTranscriptionSession({
      provider: "openai",
      options: { provider: "openai" },
      dependencies: {
        createClient: () => {
          throw new Error("must not create a socket after stop");
        },
        requestToken: () =>
          new Promise((resolve) => {
            resolveToken = resolve;
          }),
      },
    });
    const pendingStart = pending.start();
    await flush();
    pending.cancelReconnects();
    const stopping = pending.stop(false);
    resolveToken("unused-token");
    await Promise.all([pendingStart, stopping]);
  });
});
