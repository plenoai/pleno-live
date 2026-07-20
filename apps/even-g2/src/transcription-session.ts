import { RealtimeTranscriptionClient } from "../../../packages/lib/realtime-transcription";
import {
  applyCommitted,
  applyPartial,
  applyTimestampedCommitted,
} from "../../../packages/lib/transcript-segments";
import type {
  RealtimeOptions,
  RealtimeTranscriptionState,
  TranscriptSegment,
} from "../../../packages/types/realtime-transcription";
import type { RealtimeEvent } from "../../../packages/lib/realtime-transcription";

const DISPLAY_TEXT_LIMIT = 400;
const SAMPLE_RATE = 16_000;

export type TranscriptionSessionStatus =
  RealtimeTranscriptionState["connectionStatus"];

export interface TranscriptionSnapshot {
  status: TranscriptionSessionStatus;
  elapsedMs: number;
  segments: TranscriptSegment[];
  finalText: string;
  partialText: string;
  fullText: string;
  displayText: string;
  error?: string;
}

export interface TranscriptionClient {
  connect(token: string, options?: RealtimeOptions): Promise<void>;
  disconnect(): void;
  sendAudioChunk(audioBase64: string, sampleRate?: number): void;
  on(event: RealtimeEvent, handler: (data: unknown) => void): void;
  readonly isConnected: boolean;
}

export interface TranscriptionSessionOptions {
  tokenProvider: () => Promise<string>;
  clientFactory?: () => TranscriptionClient;
  now?: () => number;
  idGenerator?: () => string;
  onSnapshot?: (snapshot: TranscriptionSnapshot) => void;
  onStatus?: (status: TranscriptionSessionStatus) => void;
  onError?: (error: Error) => void;
}

interface TimestampedTextEvent {
  words: Array<{ speaker_id?: string }>;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }

  return btoa(binary);
}

function toError(value: unknown, fallback: string): Error {
  if (value instanceof Error) {
    return value;
  }

  return new Error(typeof value === "string" ? value : fallback);
}

function readText(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("text" in data)) {
    return undefined;
  }

  return typeof data.text === "string" ? data.text : undefined;
}

export class TranscriptionSession {
  private readonly tokenProvider: () => Promise<string>;
  private readonly clientFactory: () => TranscriptionClient;
  private readonly now: () => number;
  private readonly idGenerator: () => string;
  private readonly onSnapshot?: (snapshot: TranscriptionSnapshot) => void;
  private readonly onStatus?: (status: TranscriptionSessionStatus) => void;
  private readonly onError?: (error: Error) => void;

  private client: TranscriptionClient | null = null;
  private segments: TranscriptSegment[] = [];
  private currentStatus: TranscriptionSessionStatus = "disconnected";
  private errorMessage: string | undefined;
  private startedAtMs: number | undefined;
  private endedAtMs: number | undefined;
  private sessionVersion = 0;
  private idSequence = 0;

  constructor(options: TranscriptionSessionOptions) {
    this.tokenProvider = options.tokenProvider;
    this.clientFactory =
      options.clientFactory ?? (() => new RealtimeTranscriptionClient());
    this.now = options.now ?? Date.now;
    this.idGenerator =
      options.idGenerator ??
      (() => `g2-segment-${this.now()}-${++this.idSequence}`);
    this.onSnapshot = options.onSnapshot;
    this.onStatus = options.onStatus;
    this.onError = options.onError;
  }

  get status(): TranscriptionSessionStatus {
    return this.currentStatus;
  }

  async start(options: RealtimeOptions = {}): Promise<void> {
    const previousClient = this.client;
    this.client = null;
    previousClient?.disconnect();

    const version = ++this.sessionVersion;
    this.segments = [];
    this.errorMessage = undefined;
    this.startedAtMs = undefined;
    this.endedAtMs = undefined;
    this.transitionTo("connecting");

    let client: TranscriptionClient | undefined;

    try {
      const token = await this.tokenProvider();
      if (version !== this.sessionVersion) {
        return;
      }
      if (token.length === 0) {
        throw new Error("Realtime transcription token was empty");
      }

      client = this.clientFactory();
      this.client = client;
      this.bindClient(client, version);
      await client.connect(token, options);

      if (version !== this.sessionVersion) {
        client.disconnect();
        return;
      }
      if (this.client !== client) {
        throw new Error(
          this.errorMessage ?? "Realtime transcription connection closed",
        );
      }
      if (!client.isConnected) {
        throw new Error("Realtime transcription connection did not open");
      }
      if (this.currentStatus === "connecting") {
        this.startedAtMs = this.now();
        this.transitionTo("connected");
      }
    } catch (cause) {
      client?.disconnect();
      if (version !== this.sessionVersion) {
        return;
      }

      const error = toError(cause, "Failed to start realtime transcription");
      this.fail(error, client);
      throw error;
    }
  }

  sendPcm(pcm: Uint8Array): boolean {
    const client = this.client;
    if (
      pcm.byteLength === 0 ||
      this.currentStatus !== "connected" ||
      !client?.isConnected
    ) {
      return false;
    }

    client.sendAudioChunk(encodeBase64(pcm), SAMPLE_RATE);
    return true;
  }

  stop(): void {
    const client = this.client;
    if (this.currentStatus === "disconnected" && client === null) {
      return;
    }

    ++this.sessionVersion;
    this.client = null;
    this.endedAtMs = this.startedAtMs === undefined ? undefined : this.now();
    this.errorMessage = undefined;
    client?.disconnect();
    this.transitionTo("disconnected");
  }

  getSnapshot(): TranscriptionSnapshot {
    const segments = this.segments.map((segment) =>
      segment.sourceIds
        ? { ...segment, sourceIds: [...segment.sourceIds] }
        : { ...segment },
    );
    const finalText = this.joinText(false);
    const partialText = this.joinText(true);
    const fullText = this.segments
      .map((segment) => segment.text)
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      status: this.currentStatus,
      elapsedMs: this.getElapsedMs(),
      segments,
      finalText,
      partialText,
      fullText,
      displayText: fullText.slice(-DISPLAY_TEXT_LIMIT),
      error: this.errorMessage,
    };
  }

  private bindClient(client: TranscriptionClient, version: number): void {
    client.on("session_started", () => {
      if (!this.isCurrent(client, version)) {
        return;
      }

      this.startedAtMs = this.now();
      this.endedAtMs = undefined;
      this.transitionTo("connected");
    });

    client.on("partial", (data) => {
      if (!this.isCurrent(client, version)) {
        return;
      }

      const text = readText(data);
      if (text === undefined) {
        this.fail(new Error("Partial transcript was invalid"), client);
        return;
      }

      this.segments = applyPartial(
        this.segments,
        text,
        this.getElapsedMs() / 1000,
        this.idGenerator,
      ).segments;
      this.emitSnapshot();
    });

    client.on("committed", (data) => {
      if (!this.isCurrent(client, version)) {
        return;
      }

      const text = readText(data);
      if (text === undefined) {
        this.fail(new Error("Committed transcript was invalid"), client);
        return;
      }

      this.applyCommittedText(text);
    });

    client.on("committedWithTimestamps", (data) => {
      if (!this.isCurrent(client, version)) {
        return;
      }

      const text = readText(data);
      if (text === undefined) {
        this.fail(new Error("Timestamped transcript was invalid"), client);
        return;
      }

      const words = (data as Partial<TimestampedTextEvent>).words;
      const speaker = Array.isArray(words)
        ? words.find((word) => typeof word?.speaker_id === "string")?.speaker_id
        : undefined;
      this.segments = applyTimestampedCommitted(
        this.segments,
        text,
        this.getElapsedMs() / 1000,
        speaker,
        this.idGenerator,
      ).segments;
      this.emitSnapshot();
    });

    client.on("error", (data) => {
      if (!this.isCurrent(client, version)) {
        return;
      }

      const message =
        typeof data === "object" &&
        data !== null &&
        "message" in data &&
        typeof data.message === "string"
          ? data.message
          : "Realtime transcription failed";
      this.fail(new Error(message), client);
    });

    client.on("close", () => {
      if (!this.isCurrent(client, version)) {
        return;
      }

      this.fail(
        new Error("Realtime transcription connection closed unexpectedly"),
        client,
      );
    });
  }

  private applyCommittedText(text: string, speaker?: string): void {
    this.segments = applyCommitted(
      this.segments,
      text,
      this.getElapsedMs() / 1000,
      speaker,
      this.idGenerator,
    ).segments;
    this.emitSnapshot();
  }

  private isCurrent(client: TranscriptionClient, version: number): boolean {
    return version === this.sessionVersion && client === this.client;
  }

  private transitionTo(status: TranscriptionSessionStatus): void {
    const changed = status !== this.currentStatus;
    this.currentStatus = status;
    if (changed) {
      this.onStatus?.(status);
    }
    this.emitSnapshot();
  }

  private fail(error: Error, client?: TranscriptionClient): void {
    const alreadyReported =
      this.currentStatus === "error" && this.errorMessage === error.message;

    if (client && client === this.client) {
      this.client = null;
    }
    this.endedAtMs = this.startedAtMs === undefined ? undefined : this.now();
    this.errorMessage = error.message;
    client?.disconnect();

    if (this.currentStatus !== "error") {
      this.currentStatus = "error";
      this.onStatus?.("error");
    }
    if (!alreadyReported) {
      this.onError?.(error);
    }
    this.emitSnapshot();
  }

  private getElapsedMs(): number {
    if (this.startedAtMs === undefined) {
      return 0;
    }

    const end = this.endedAtMs ?? this.now();
    return Math.max(0, end - this.startedAtMs);
  }

  private joinText(isPartial: boolean): string {
    return this.segments
      .filter((segment) => segment.isPartial === isPartial)
      .map((segment) => segment.text)
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  private emitSnapshot(): void {
    this.onSnapshot?.(this.getSnapshot());
  }
}
