import {
  AudioInputSource,
  CreateStartUpPageContainer,
  type EvenAppBridge,
  type EvenHubEvent,
  OsEventTypeList,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
} from "@evenrealities/even_hub_sdk";

const TEXT_CONTAINER_ID = 1;
const TEXT_CONTAINER_NAME = "transcript";
const DEFAULT_TEXT = "Listening…";

export const G2_AUDIO_FORMAT = Object.freeze({
  encoding: "pcm_s16le",
  sampleRateHz: 16_000,
  channelCount: 1,
} as const);

export type G2AudioFormat = typeof G2_AUDIO_FORMAT;
export type G2ExitReason = "system" | "abnormal";

export type G2Bridge = Pick<
  EvenAppBridge,
  | "audioControl"
  | "createStartUpPageContainer"
  | "onEvenHubEvent"
  | "shutDownPageContainer"
  | "textContainerUpgrade"
>;

export interface G2AdapterCallbacks {
  onAudio?: (pcm: Uint8Array, format: G2AudioFormat) => void;
  onClick?: () => void;
  onExit?: (reason: G2ExitReason) => void;
}

export interface G2AdapterStartOptions extends G2AdapterCallbacks {
  initialText?: string;
  microphoneEnabled?: boolean;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export interface G2AdapterDependencies {
  connect?: () => Promise<G2Bridge>;
  debounceMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
}

type AdapterPhase = "idle" | "starting" | "running" | "stopping";

export class G2Adapter {
  private readonly connect: () => Promise<G2Bridge>;
  private readonly debounceMs: number;
  private readonly setTimer: NonNullable<G2AdapterDependencies["setTimer"]>;
  private readonly clearTimer: NonNullable<G2AdapterDependencies["clearTimer"]>;

  private bridge: G2Bridge | null = null;
  private callbacks: G2AdapterCallbacks = {};
  private phase: AdapterPhase = "idle";
  private unsubscribe: (() => void) | null = null;
  private microphoneOpen = false;
  private microphoneTask: Promise<boolean> | null = null;
  private microphoneTaskTarget: boolean | null = null;
  private exitRequested = false;
  private cleanupPromise: Promise<void> | null = null;
  private generation = 0;

  private renderTimer: TimerHandle | null = null;
  private pendingText: string | null = null;
  private renderedText = "";
  private textWrite: Promise<boolean> | null = null;

  constructor(dependencies: G2AdapterDependencies = {}) {
    this.connect = dependencies.connect ?? waitForEvenAppBridge;
    this.debounceMs = dependencies.debounceMs ?? 120;
    this.setTimer =
      dependencies.setTimer ??
      ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = dependencies.clearTimer ?? clearTimeout;
  }

  get isRunning(): boolean {
    return this.phase === "running";
  }

  async start(options: G2AdapterStartOptions = {}): Promise<void> {
    if (this.phase !== "idle") {
      throw new Error("G2 adapter is already active");
    }

    this.phase = "starting";
    const generation = ++this.generation;
    this.callbacks = options;
    this.exitRequested = false;
    const initialText = options.initialText ?? DEFAULT_TEXT;

    try {
      const bridge = await this.connect();
      if (this.phase !== "starting" || generation !== this.generation) {
        throw new Error("G2 startup was interrupted");
      }
      this.bridge = bridge;

      const result = await bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({
          containerTotalNum: 1,
          textObject: [
            new TextContainerProperty({
              xPosition: 0,
              yPosition: 0,
              width: 576,
              height: 288,
              borderWidth: 0,
              paddingLength: 4,
              containerID: TEXT_CONTAINER_ID,
              containerName: TEXT_CONTAINER_NAME,
              content: initialText,
              isEventCapture: 1,
            }),
          ],
        }),
      );

      if (result !== StartUpPageCreateResult.success) {
        throw new Error(`G2 startup page creation failed (${result})`);
      }
      if (
        this.phase !== "starting" ||
        this.bridge !== bridge ||
        generation !== this.generation
      ) {
        throw new Error("G2 startup was interrupted");
      }

      this.renderedText = initialText;
      this.unsubscribe = bridge.onEvenHubEvent((event) =>
        this.handleEvent(event),
      );
      this.phase = "running";

      if (
        options.microphoneEnabled &&
        !(await this.setMicrophoneEnabled(true))
      ) {
        throw new Error("G2 microphone failed to open");
      }
    } catch (error) {
      if (generation === this.generation) {
        await this.cleanup();
      }
      throw error;
    }
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<boolean> {
    if (this.microphoneTask) {
      await this.microphoneTask;
    }

    const bridge = this.bridge;
    if (this.phase !== "running" || !bridge) {
      return false;
    }
    if (this.microphoneOpen === enabled) {
      return true;
    }

    const task = this.applyMicrophoneState(bridge, enabled);
    this.microphoneTask = task;
    this.microphoneTaskTarget = enabled;
    try {
      return await task;
    } finally {
      if (this.microphoneTask === task) {
        this.microphoneTask = null;
        this.microphoneTaskTarget = null;
      }
    }
  }

  updateText(content: string): void {
    if (this.phase !== "running" || content === this.pendingText) {
      return;
    }

    if (content === this.renderedText && !this.textWrite) {
      this.pendingText = null;
      if (this.renderTimer !== null) {
        this.clearTimer(this.renderTimer);
        this.renderTimer = null;
      }
      return;
    }

    this.pendingText = content;
    if (this.renderTimer !== null) {
      this.clearTimer(this.renderTimer);
    }

    this.renderTimer = this.setTimer(() => {
      this.renderTimer = null;
      void this.flushText().catch(() => undefined);
    }, this.debounceMs);
  }

  async flushText(): Promise<boolean> {
    if (this.renderTimer !== null) {
      this.clearTimer(this.renderTimer);
      this.renderTimer = null;
    }

    if (this.textWrite) {
      await this.textWrite;
      return this.flushText();
    }

    const bridge = this.bridge;
    const content = this.pendingText;
    if (this.phase !== "running" || !bridge || content === null) {
      return false;
    }

    this.pendingText = null;
    if (content === this.renderedText) {
      return true;
    }

    const write = bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: TEXT_CONTAINER_ID,
        containerName: TEXT_CONTAINER_NAME,
        content,
      }),
    );
    this.textWrite = write;

    try {
      const upgraded = await write;
      if (upgraded && this.phase === "running") {
        this.renderedText = content;
      }
      return upgraded;
    } finally {
      if (this.textWrite === write) {
        this.textWrite = null;
      }
    }
  }

  async stop(): Promise<void> {
    await this.cleanup();
  }

  private handleEvent(event: EvenHubEvent): void {
    if (this.phase !== "starting" && this.phase !== "running") {
      return;
    }

    const pcm = event.audioEvent?.audioPcm;
    if (pcm) {
      this.callbacks.onAudio?.(pcm, G2_AUDIO_FORMAT);
    }

    const sysType = event.sysEvent ? event.sysEvent.eventType : null;
    const textType = event.textEvent ? event.textEvent.eventType : null;

    if (
      sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
      textType === OsEventTypeList.DOUBLE_CLICK_EVENT
    ) {
      if (!this.exitRequested) {
        this.exitRequested = true;
        const bridge = this.bridge;
        void bridge?.shutDownPageContainer(1).finally(() => {
          if (this.bridge === bridge && this.phase === "running") {
            this.exitRequested = false;
          }
        });
      }
      return;
    }

    const exitReason = getExitReason(sysType) ?? getExitReason(textType);
    if (exitReason) {
      void this.cleanup(exitReason).catch(() => undefined);
      return;
    }

    if (isClickEvent(event.sysEvent) || isClickEvent(event.textEvent)) {
      this.callbacks.onClick?.();
    }
  }

  private async applyMicrophoneState(
    bridge: G2Bridge,
    enabled: boolean,
  ): Promise<boolean> {
    let accepted: boolean;
    try {
      accepted = enabled
        ? await bridge.audioControl(true, AudioInputSource.Glasses)
        : await bridge.audioControl(false);
    } catch (error) {
      if (enabled) {
        await bridge.audioControl(false).catch(() => false);
      }
      throw error;
    }
    if (!accepted) {
      if (enabled) {
        await bridge.audioControl(false).catch(() => false);
      }
      return false;
    }

    if (this.phase === "running" && this.bridge === bridge) {
      this.microphoneOpen = enabled;
      return true;
    }

    if (enabled) {
      await bridge.audioControl(false);
    } else if (this.bridge === bridge) {
      this.microphoneOpen = false;
    }
    return false;
  }

  private async cleanup(exitReason?: G2ExitReason): Promise<void> {
    if (this.cleanupPromise) {
      return this.cleanupPromise;
    }
    if (this.phase === "idle") {
      return;
    }

    const cleanup = this.performCleanup(exitReason);
    this.cleanupPromise = cleanup;
    try {
      await cleanup;
    } finally {
      if (this.cleanupPromise === cleanup) {
        this.cleanupPromise = null;
      }
    }
  }

  private async performCleanup(
    exitReason: G2ExitReason | undefined,
  ): Promise<void> {
    ++this.generation;
    this.phase = "stopping";
    this.pendingText = null;
    if (this.renderTimer !== null) {
      this.clearTimer(this.renderTimer);
      this.renderTimer = null;
    }

    const bridge = this.bridge;
    const microphoneTask = this.microphoneTask;
    const microphoneTaskTarget = this.microphoneTaskTarget;
    const onExit = this.callbacks.onExit;

    try {
      this.unsubscribe?.();
    } catch {
      // Continue releasing the microphone even if the SDK listener is already gone.
    }
    this.unsubscribe = null;

    try {
      if (microphoneTask) {
        await microphoneTask.catch(() => false);
      }
      if (bridge && (this.microphoneOpen || microphoneTaskTarget === true)) {
        await bridge.audioControl(false);
      }
    } finally {
      this.microphoneOpen = false;
      this.microphoneTask = null;
      this.microphoneTaskTarget = null;
      this.bridge = null;
      this.phase = "idle";
      this.callbacks = {};
      this.exitRequested = false;
      this.renderedText = "";
      this.textWrite = null;
      if (exitReason) {
        onExit?.(exitReason);
      }
    }
  }
}

function isClickEvent(
  event: { eventType?: OsEventTypeList } | undefined,
): boolean {
  return (
    Boolean(event) &&
    (event?.eventType ?? OsEventTypeList.CLICK_EVENT) ===
      OsEventTypeList.CLICK_EVENT
  );
}

function getExitReason(
  eventType: OsEventTypeList | null | undefined,
): G2ExitReason | null {
  if (eventType === OsEventTypeList.SYSTEM_EXIT_EVENT) {
    return "system";
  }
  if (eventType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    return "abnormal";
  }
  return null;
}
