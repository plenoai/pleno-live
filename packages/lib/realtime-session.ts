import type { RealtimeClient } from "./realtime-client";
import type {
  RealtimeOptions,
  RealtimeProvider,
} from "../types/realtime-transcription";

export const REALTIME_RECONNECT_DELAYS_MS = [1000, 2000, 4000] as const;
export const MAX_REALTIME_RECONNECT_ATTEMPTS =
  REALTIME_RECONNECT_DELAYS_MS.length;

type ClientError = { code?: string; message: string };
type TranscriptEvent = { text: string; itemId?: string };
type TimestampedTranscriptEvent = {
  text: string;
  words?: Array<{
    text: string;
    start: number;
    end: number;
    speaker_id?: string;
  }>;
};

export interface RealtimeSessionHandlers {
  onConnected?: () => void;
  onReconnecting?: () => void;
  onReconnectExhausted?: (error: unknown) => void;
  onPartial?: (data: TranscriptEvent) => void;
  onCommitted?: (data: TranscriptEvent) => void;
  onCommittedWithTimestamps?: (data: TimestampedTranscriptEvent) => void;
  onError?: (error: ClientError) => void;
}

export interface RealtimeSessionDependencies {
  createClient: (provider: RealtimeProvider) => RealtimeClient;
  requestToken: (provider: RealtimeProvider) => Promise<string>;
}

interface RealtimeSessionConfig {
  provider: RealtimeProvider;
  options: RealtimeOptions;
  dependencies: RealtimeSessionDependencies;
  handlers?: RealtimeSessionHandlers;
}

const isQuotaError = (error: ClientError) =>
  error.code === "quota_exceeded" || error.code === "insufficient_quota";

/** Owns one transcription session and retries unexpected transport failures. */
export class RealtimeTranscriptionSession {
  private client: RealtimeClient | null = null;
  private active = false;
  private stopRequested = false;
  private retryBlocked = false;
  private established = false;
  private connecting = false;
  private retryAttempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastError: unknown = new Error("Realtime connection was closed");

  constructor(private readonly config: RealtimeSessionConfig) {}

  get isConnected(): boolean {
    return this.client?.isConnected ?? false;
  }

  get isActive(): boolean {
    return this.active && !this.stopRequested && !this.retryBlocked;
  }

  get isTerminal(): boolean {
    return !this.stopRequested && this.retryBlocked;
  }

  async start(): Promise<void> {
    if (this.active) throw new Error("Realtime session is already active");
    this.active = true;
    this.stopRequested = false;
    this.retryBlocked = false;
    this.connecting = true;
    try {
      await this.connectFresh();
      this.connecting = false;
    } catch (error) {
      this.connecting = false;
      if (this.stopRequested) return;
      throw error;
    }
  }

  sendAudioChunk(audioBase64: string, sampleRate = 16000): void {
    if (this.client?.isConnected) {
      this.client.sendAudioChunk(audioBase64, sampleRate);
    }
  }

  /** Cancel pending retries synchronously before the hook awaits audio shutdown. */
  cancelReconnects(): void {
    this.stopRequested = true;
    this.retryBlocked = true;
    this.clearRetryTimer();
  }

  /** Expedite a pending retry after a real background-to-active transition. */
  resume(): void {
    if (
      !this.active ||
      this.stopRequested ||
      !this.established ||
      this.client?.isConnected ||
      this.connecting
    )
      return;
    // A foreground transition permits one new bounded attempt cycle after an outage.
    if (this.retryBlocked) {
      this.retryBlocked = false;
      this.retryAttempts = 0;
    }
    this.clearRetryTimer();
    void this.retry();
  }

  async stop(finalize = true): Promise<void> {
    this.cancelReconnects();
    const client = this.client;

    if (finalize && client?.isConnected) {
      try {
        await client.finalize?.();
      } catch {
        // Finalization must not prevent the recording from stopping.
      }
    }

    this.active = false;
    this.client = null;
    client?.disconnect();
  }

  private async connectFresh(): Promise<void> {
    const { provider, options, dependencies } = this.config;
    const token = await dependencies.requestToken(provider);
    if (!this.active || this.stopRequested) return;

    const previous = this.client;
    const client = dependencies.createClient(provider);
    this.client = client;
    if (previous && previous !== client) previous.disconnect();
    this.bindClient(client);

    try {
      await client.connect(token, options);
    } catch (error) {
      if (this.client === client) {
        this.client = null;
        client.disconnect();
      }
      throw error;
    }
  }

  private bindClient(client: RealtimeClient): void {
    const current = () => this.active && this.client === client;

    client.on("session_started", () => {
      if (!current() || this.stopRequested) return;
      this.established = true;
      this.connecting = false;
      this.clearRetryTimer();
      this.config.handlers?.onConnected?.();
    });

    client.on("partial", (data: TranscriptEvent) => {
      if (current()) this.config.handlers?.onPartial?.(data);
    });
    client.on("committed", (data: TranscriptEvent) => {
      if (current()) this.config.handlers?.onCommitted?.(data);
    });
    client.on("committedWithTimestamps", (data: TimestampedTranscriptEvent) => {
      if (current()) this.config.handlers?.onCommittedWithTimestamps?.(data);
    });

    client.on("error", (error: ClientError) => {
      if (!current() || this.stopRequested) return;
      this.config.handlers?.onError?.(error);
      if (isQuotaError(error)) {
        this.blockForQuota(client);
      } else if (this.established) {
        this.scheduleRetry(error);
      }
    });

    client.on("close", () => {
      if (!current() || this.stopRequested || !this.established) return;
      this.scheduleRetry(new Error("Realtime connection was closed"));
    });
  }

  private scheduleRetry(error: unknown): void {
    if (
      !this.active ||
      this.stopRequested ||
      this.retryBlocked ||
      this.connecting ||
      this.retryTimer
    )
      return;
    this.lastError = error;
    if (this.retryAttempts >= MAX_REALTIME_RECONNECT_ATTEMPTS) {
      this.exhaustRetries(error);
      return;
    }

    this.config.handlers?.onReconnecting?.();
    const delay = REALTIME_RECONNECT_DELAYS_MS[this.retryAttempts];
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.retry();
    }, delay);
  }

  private async retry(): Promise<void> {
    if (
      !this.active ||
      this.stopRequested ||
      this.retryBlocked ||
      this.connecting
    )
      return;
    if (this.retryAttempts >= MAX_REALTIME_RECONNECT_ATTEMPTS) {
      this.exhaustRetries(this.lastError);
      return;
    }

    this.retryAttempts += 1;
    this.connecting = true;
    this.config.handlers?.onReconnecting?.();
    try {
      await this.connectFresh();
      this.connecting = false;
    } catch (error) {
      this.connecting = false;
      if (!this.active || this.stopRequested || this.retryBlocked) return;
      this.lastError = error;
      if (this.retryAttempts >= MAX_REALTIME_RECONNECT_ATTEMPTS) {
        this.exhaustRetries(error);
      } else {
        this.scheduleRetry(error);
      }
    }
  }

  private blockForQuota(client: RealtimeClient): void {
    this.retryBlocked = true;
    this.active = false;
    this.connecting = false;
    this.clearRetryTimer();
    if (this.client === client) this.client = null;
    client.disconnect();
  }

  private exhaustRetries(error: unknown): void {
    if (!this.active || this.stopRequested) return;
    this.retryBlocked = true;
    this.connecting = false;
    this.clearRetryTimer();
    const client = this.client;
    this.client = null;
    client?.disconnect();
    this.config.handlers?.onReconnectExhausted?.(error);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
