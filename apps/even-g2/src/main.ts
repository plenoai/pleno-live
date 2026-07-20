import type { TranscriptSegment } from "../../../packages/types/realtime-transcription";

import { G2Adapter, type G2ExitReason } from "./g2-adapter";
import { formatG2Screen, PcmLevelMeter } from "./glasses-view";
import { LifecycleFence } from "./lifecycle-fence";
import { archiveSnapshot } from "./session-history";
import { clearG2Session, loadG2Session, saveG2Session } from "./session-store";
import { createRealtimeTokenProvider } from "./token-provider";
import {
  TranscriptionSession,
  type TranscriptionSnapshot,
} from "./transcription-session";
import { mountUi, type UiState } from "./ui";

const EMPTY_SNAPSHOT: TranscriptionSnapshot = {
  status: "disconnected",
  elapsedMs: 0,
  segments: [],
  finalText: "",
  partialText: "",
  fullText: "",
  displayText: "",
};

const START_ERROR = "文字起こしを開始できませんでした";
const CONNECTION_ERROR = "文字起こしの接続が切れました";
const G2_CONNECTION_ERROR = "G2 に接続できませんでした";

const restored = loadG2Session();
const meter = new PcmLevelMeter();
const adapter = new G2Adapter({ debounceMs: 160 });
const lifecycle = new LifecycleFence();

let uiState: UiState = "connecting";
let lastError: string | undefined;
let elapsedBaseMs = restored?.elapsedMs ?? 0;
let latestSnapshot = EMPTY_SNAPSHOT;
let sessionCapturedAudio = false;
let ignoreSessionSnapshots = false;
let meterText = meter.render();
let lastMeterRenderAt = 0;
let operation: Promise<void> | null = null;
let stopped = false;
let audioForwarding = false;
let microphoneNeedsClose = false;
let errorRecovery: "start" | "pause" = "start";

let historySegments: TranscriptSegment[] = restored?.finalText
  ? [
      {
        id: `restored-${restored.savedAt}`,
        text: restored.finalText,
        isPartial: false,
        timestamp: 0,
      },
    ]
  : [];

const ui = mountUi({
  onToggle: () => requestToggle(),
});

const transcription = new TranscriptionSession({
  tokenProvider: createRealtimeTokenProvider(),
  onSnapshot: (snapshot) => {
    if (stopped || ignoreSessionSnapshots) return;
    latestSnapshot = snapshot;
    render();
    if (uiState === "listening") {
      persist(true);
    } else if (snapshot.status === "error") {
      persist(false);
    }
  },
  onError: () => {
    if (stopped) return;
    audioForwarding = false;
    errorRecovery = "start";
    lastError = CONNECTION_ERROR;
    uiState = "error";
    void closeMicrophone();
    persist(false);
    render();
  },
});

function currentSegments(): TranscriptSegment[] {
  const offsetSeconds = elapsedBaseMs / 1_000;
  return [
    ...historySegments,
    ...latestSnapshot.segments.map((segment) => ({
      ...segment,
      timestamp: segment.timestamp + offsetSeconds,
    })),
  ];
}

function currentElapsedMs(): number {
  return elapsedBaseMs + latestSnapshot.elapsedMs;
}

function currentTranscript(): string {
  return currentSegments()
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ");
}

function render(): void {
  if (stopped) return;

  const segments = currentSegments();
  const elapsedMs = currentElapsedMs();
  ui.update({
    state: uiState,
    elapsedMs,
    transcript: segments,
    errorMessage: lastError,
  });

  adapter.updateText(
    formatG2Screen({
      state: uiState,
      elapsedMs,
      transcript: segments.map(({ text }) => text).join(" "),
      meter: meterText,
      error: lastError,
    }),
  );
}

function persist(shouldResume: boolean, allowAfterExit = false): void {
  if (stopped && !allowAfterExit) return;

  try {
    saveG2Session({
      finalText: currentTranscript(),
      elapsedMs: currentElapsedMs(),
      shouldResume,
      savedAt: Date.now(),
    });
  } catch (error) {
    console.warn("[Pleno G2] Session state could not be saved", error);
  }
}

function archiveCurrentSession(): boolean {
  const snapshot = transcription.getSnapshot();
  const archived = archiveSnapshot(
    historySegments,
    elapsedBaseMs,
    snapshot,
    sessionCapturedAudio,
  );
  historySegments = archived.segments;
  elapsedBaseMs = archived.elapsedMs;

  ignoreSessionSnapshots = true;
  transcription.stop();
  ignoreSessionSnapshots = false;
  latestSnapshot = EMPTY_SNAPSHOT;
  sessionCapturedAudio = false;
  return archived.providerFailed;
}

function onAudio(pcm: Uint8Array): void {
  if (stopped || !audioForwarding) return;

  sessionCapturedAudio = true;
  transcription.sendPcm(pcm);
  meterText = meter.push(pcm);

  const now = performance.now();
  if (now - lastMeterRenderAt >= 250) {
    lastMeterRenderAt = now;
    render();
  }
}

async function closeMicrophone(): Promise<boolean> {
  audioForwarding = false;
  if (!adapter.isRunning) {
    microphoneNeedsClose = false;
    return true;
  }

  try {
    const closed = await adapter.setMicrophoneEnabled(false);
    microphoneNeedsClose = !closed;
    return closed;
  } catch {
    microphoneNeedsClose = true;
    return false;
  }
}

async function ensureAdapter(): Promise<void> {
  if (adapter.isRunning) return;

  await adapter.start({
    initialText: formatG2Screen({
      state: "connecting",
      elapsedMs: currentElapsedMs(),
      transcript: currentTranscript(),
      meter: meterText,
    }),
    microphoneEnabled: false,
    onAudio,
    onClick: () => {
      void requestToggle().catch(() => undefined);
    },
    onExit: (reason) => {
      void handleExit(reason);
    },
  });
}

function isOperationActive(generation: number): boolean {
  return !stopped && lifecycle.isActive(generation);
}

async function startListening(generation: number): Promise<void> {
  if (!isOperationActive(generation)) return;

  if (
    latestSnapshot.segments.length > 0 ||
    transcription.status !== "disconnected"
  ) {
    archiveCurrentSession();
  }

  uiState = "connecting";
  audioForwarding = false;
  errorRecovery = "start";
  lastError = undefined;
  latestSnapshot = EMPTY_SNAPSHOT;
  render();

  try {
    await ensureAdapter();
    if (!isOperationActive(generation)) return;

    await transcription.start({
      languageCode: "ja",
      vad: { silenceThresholdSecs: 0.5, minSpeechDurationMs: 250 },
    });
    if (!isOperationActive(generation)) return;

    audioForwarding = true;
    const microphoneStarted = await adapter.setMicrophoneEnabled(true);
    if (!isOperationActive(generation)) {
      await closeMicrophone();
      return;
    }
    if (!microphoneStarted) {
      throw new Error("G2 マイクを開始できませんでした");
    }

    microphoneNeedsClose = false;
    sessionCapturedAudio = true;
    uiState = "listening";
    persist(true);
    render();
  } catch (error) {
    audioForwarding = false;
    await closeMicrophone();
    if (!isOperationActive(generation)) return;

    if (transcription.status !== "disconnected") {
      archiveCurrentSession();
    }
    lastError = START_ERROR;
    uiState = "error";
    persist(false);
    render();
    throw error;
  }
}

async function pauseListening(generation: number): Promise<void> {
  if (!isOperationActive(generation)) return;

  audioForwarding = false;
  const microphoneClosed = await closeMicrophone();
  if (!isOperationActive(generation)) return;

  const providerFailed = archiveCurrentSession();

  if (providerFailed || !microphoneClosed) {
    lastError = providerFailed
      ? CONNECTION_ERROR
      : "G2 マイクを停止できませんでした";
    uiState = "error";
    errorRecovery = "pause";
    persist(false);
    render();
    throw new Error(lastError);
  }

  uiState = "paused";
  errorRecovery = "start";
  lastError = undefined;
  persist(false);
  render();
}

async function toggle(generation: number): Promise<void> {
  if (!isOperationActive(generation) || uiState === "connecting") return;
  if (uiState === "listening") {
    await pauseListening(generation);
    return;
  }

  if (uiState === "error" && errorRecovery === "pause") {
    if (microphoneNeedsClose && !(await closeMicrophone())) {
      throw new Error("G2 マイクを停止できませんでした");
    }
    if (!isOperationActive(generation)) return;

    uiState = "paused";
    errorRecovery = "start";
    lastError = undefined;
    persist(false);
    render();
    return;
  }

  await startListening(generation);
}

function requestToggle(): Promise<void> {
  if (stopped) return Promise.resolve();
  if (operation) return operation;
  const generation = lifecycle.capture();
  operation = toggle(generation).finally(() => {
    operation = null;
  });
  return operation;
}

async function handleExit(reason: G2ExitReason): Promise<void> {
  if (stopped) return;
  stopped = true;
  lifecycle.close();
  audioForwarding = false;
  const shouldResume = reason === "abnormal" && uiState === "listening";
  archiveCurrentSession();
  if (reason === "system") {
    clearG2Session();
  } else {
    persist(shouldResume, true);
  }
  window.clearInterval(timer);
  ui.destroy();
}

async function bootstrap(): Promise<void> {
  try {
    await ensureAdapter();
    if (stopped) return;

    uiState = historySegments.length > 0 ? "paused" : "ready";
    render();

    if (restored?.shouldResume) {
      await requestToggle();
      if (stopped) return;
    }
    console.info("[Pleno G2] ready");
  } catch {
    if (stopped) return;

    lastError = G2_CONNECTION_ERROR;
    uiState = "error";
    render();
  }
}

const timer = window.setInterval(() => {
  if (uiState === "listening") {
    latestSnapshot = transcription.getSnapshot();
    render();
  }
}, 1_000);

window.addEventListener("beforeunload", () => {
  audioForwarding = false;
  if (!stopped) persist(uiState === "listening");
  stopped = true;
  lifecycle.close();
  transcription.stop();
  void adapter.stop();
  window.clearInterval(timer);
  ui.destroy();
});

void bootstrap();
