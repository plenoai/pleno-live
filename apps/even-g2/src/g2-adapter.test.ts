import {
  AudioEvent,
  AudioInputSource,
  type EvenHubEvent,
  OsEventTypeList,
  StartUpPageCreateResult,
  Sys_ItemEvent,
  Text_ItemEvent,
} from "@evenrealities/even_hub_sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { G2Adapter, G2_AUDIO_FORMAT, type G2Bridge } from "./g2-adapter";

function createBridge() {
  let listener: (event: EvenHubEvent) => void = () => undefined;
  const unsubscribe = vi.fn();
  const bridge: G2Bridge = {
    audioControl: vi.fn<G2Bridge["audioControl"]>(async () => true),
    createStartUpPageContainer: vi.fn<G2Bridge["createStartUpPageContainer"]>(
      async () => StartUpPageCreateResult.success,
    ),
    onEvenHubEvent: vi.fn<G2Bridge["onEvenHubEvent"]>((callback) => {
      listener = callback;
      return unsubscribe;
    }),
    shutDownPageContainer: vi.fn<G2Bridge["shutDownPageContainer"]>(
      async () => true,
    ),
    textContainerUpgrade: vi.fn<G2Bridge["textContainerUpgrade"]>(
      async () => true,
    ),
  };

  return {
    bridge,
    emit: (event: EvenHubEvent) => listener(event),
    unsubscribe,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("G2Adapter", () => {
  it("creates the full-size startup page and leaves the microphone disabled by default", async () => {
    const { bridge } = createBridge();
    const adapter = new G2Adapter({ connect: async () => bridge });

    await adapter.start({ initialText: "Ready" });

    const startupPage = vi.mocked(bridge.createStartUpPageContainer).mock
      .calls[0]?.[0];
    expect(startupPage).toMatchObject({
      containerTotalNum: 1,
      textObject: [
        {
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          containerID: 1,
          containerName: "transcript",
          content: "Ready",
          isEventCapture: 1,
        },
      ],
    });
    expect(bridge.audioControl).not.toHaveBeenCalled();
    expect(
      vi.mocked(bridge.createStartUpPageContainer).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(bridge.onEvenHubEvent).mock.invocationCallOrder[0]!,
    );
    expect(adapter.isRunning).toBe(true);
  });

  it("opens, pauses, and resumes the G2 microphone without rebuilding or shutting down the page", async () => {
    const { bridge } = createBridge();
    const adapter = new G2Adapter({ connect: async () => bridge });

    await adapter.start({ microphoneEnabled: true });
    await expect(adapter.setMicrophoneEnabled(false)).resolves.toBe(true);
    await expect(adapter.setMicrophoneEnabled(true)).resolves.toBe(true);

    expect(bridge.audioControl).toHaveBeenNthCalledWith(
      1,
      true,
      AudioInputSource.Glasses,
    );
    expect(bridge.audioControl).toHaveBeenNthCalledWith(2, false);
    expect(bridge.audioControl).toHaveBeenNthCalledWith(
      3,
      true,
      AudioInputSource.Glasses,
    );
    expect(bridge.createStartUpPageContainer).toHaveBeenCalledOnce();
    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
  });

  it("routes PCM16k mono audio and single clicks without mistaking audio events for clicks", async () => {
    const { bridge, emit } = createBridge();
    const onAudio = vi.fn();
    const onClick = vi.fn();
    const adapter = new G2Adapter({ connect: async () => bridge });
    await adapter.start({ onAudio, onClick, microphoneEnabled: true });

    const pcm = new Uint8Array([0, 1, 254, 255]);
    emit({ audioEvent: new AudioEvent({ audioPcm: pcm }) });
    emit({ sysEvent: new Sys_ItemEvent() });
    emit({
      textEvent: new Text_ItemEvent({ eventType: OsEventTypeList.CLICK_EVENT }),
    });

    expect(onAudio).toHaveBeenCalledOnce();
    expect(onAudio).toHaveBeenCalledWith(pcm, G2_AUDIO_FORMAT);
    expect(G2_AUDIO_FORMAT).toEqual({
      encoding: "pcm_s16le",
      sampleRateHz: 16_000,
      channelCount: 1,
    });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("requests the foreground exit dialog once for root-level double clicks", async () => {
    const { bridge, emit } = createBridge();
    const onClick = vi.fn();
    const adapter = new G2Adapter({ connect: async () => bridge });
    await adapter.start({ onClick });

    emit({
      textEvent: new Text_ItemEvent({
        eventType: OsEventTypeList.DOUBLE_CLICK_EVENT,
      }),
    });
    emit({
      sysEvent: new Sys_ItemEvent({
        eventType: OsEventTypeList.DOUBLE_CLICK_EVENT,
      }),
    });

    expect(bridge.shutDownPageContainer).toHaveBeenCalledOnce();
    expect(bridge.shutDownPageContainer).toHaveBeenCalledWith(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("allows a later double click after the exit dialog is cancelled", async () => {
    const { bridge, emit } = createBridge();
    const adapter = new G2Adapter({ connect: async () => bridge });
    await adapter.start();

    const doubleClick = {
      sysEvent: new Sys_ItemEvent({
        eventType: OsEventTypeList.DOUBLE_CLICK_EVENT,
      }),
    };
    emit(doubleClick);
    await vi.waitFor(() =>
      expect(bridge.shutDownPageContainer).toHaveBeenCalledOnce(),
    );
    emit(doubleClick);

    expect(bridge.shutDownPageContainer).toHaveBeenCalledTimes(2);
  });

  it.each([
    [OsEventTypeList.SYSTEM_EXIT_EVENT, "system"],
    [OsEventTypeList.ABNORMAL_EXIT_EVENT, "abnormal"],
  ] as const)("cleans up once for exit event %s", async (eventType, reason) => {
    const { bridge, emit, unsubscribe } = createBridge();
    const onExit = vi.fn();
    const adapter = new G2Adapter({ connect: async () => bridge });
    await adapter.start({ onExit, microphoneEnabled: true });

    emit({ sysEvent: new Sys_ItemEvent({ eventType }) });
    emit({ sysEvent: new Sys_ItemEvent({ eventType }) });

    await vi.waitFor(() => {
      expect(bridge.audioControl).toHaveBeenLastCalledWith(false);
      expect(onExit).toHaveBeenCalledWith(reason);
    });
    expect(onExit).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
    expect(adapter.isRunning).toBe(false);
  });

  it("debounces text upgrades, writes only the latest content, and suppresses stale writes", async () => {
    vi.useFakeTimers();
    const { bridge } = createBridge();
    const adapter = new G2Adapter({
      connect: async () => bridge,
      debounceMs: 120,
    });
    await adapter.start({ initialText: "Listening" });

    adapter.updateText("stale partial");
    adapter.updateText("Listening");
    await vi.advanceTimersByTimeAsync(120);
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();

    adapter.updateText("first partial");
    adapter.updateText("latest partial");
    await vi.advanceTimersByTimeAsync(119);
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(bridge.textContainerUpgrade).toHaveBeenCalledOnce();
    expect(
      vi.mocked(bridge.textContainerUpgrade).mock.calls[0]?.[0],
    ).toMatchObject({
      containerID: 1,
      containerName: "transcript",
      content: "latest partial",
    });

    adapter.updateText("latest partial");
    await vi.advanceTimersByTimeAsync(120);
    expect(bridge.textContainerUpgrade).toHaveBeenCalledOnce();
  });

  it("stops the listener and microphone without shutting down the root page", async () => {
    const { bridge, unsubscribe } = createBridge();
    unsubscribe.mockImplementationOnce(() => {
      throw new Error("already unsubscribed");
    });
    const adapter = new G2Adapter({ connect: async () => bridge });
    await adapter.start({ microphoneEnabled: true });

    await adapter.stop();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(bridge.audioControl).toHaveBeenLastCalledWith(false);
    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
    await expect(adapter.setMicrophoneEnabled(true)).resolves.toBe(false);
  });

  it("cleans up without shutting down the page when initial microphone startup fails", async () => {
    const { bridge, unsubscribe } = createBridge();
    vi.mocked(bridge.audioControl).mockResolvedValueOnce(false);
    const adapter = new G2Adapter({ connect: async () => bridge });

    await expect(adapter.start({ microphoneEnabled: true })).rejects.toThrow(
      "G2 microphone failed to open",
    );

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
    expect(adapter.isRunning).toBe(false);
  });

  it("fails closed when the microphone open request rejects", async () => {
    const { bridge } = createBridge();
    vi.mocked(bridge.audioControl).mockRejectedValueOnce(
      new Error("bridge response lost"),
    );
    const adapter = new G2Adapter({ connect: async () => bridge });
    await adapter.start();

    await expect(adapter.setMicrophoneEnabled(true)).rejects.toThrow(
      "bridge response lost",
    );
    expect(bridge.audioControl).toHaveBeenLastCalledWith(false);
  });

  it("closes a microphone that finishes opening while cleanup is in progress", async () => {
    const { bridge } = createBridge();
    let finishOpening: (opened: boolean) => void = () => undefined;
    vi.mocked(bridge.audioControl).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishOpening = resolve;
        }),
    );
    const adapter = new G2Adapter({ connect: async () => bridge });
    await adapter.start();

    const enabling = adapter.setMicrophoneEnabled(true);
    await vi.waitFor(() =>
      expect(bridge.audioControl).toHaveBeenCalledWith(true, "glasses"),
    );
    const stopping = adapter.stop();
    finishOpening(true);

    await expect(enabling).resolves.toBe(false);
    await expect(stopping).resolves.toBeUndefined();
    expect(bridge.audioControl).toHaveBeenLastCalledWith(false);
    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
  });

  it("does not let an interrupted connection replace a newer bridge", async () => {
    const first = createBridge();
    const second = createBridge();
    let resolveFirst: (bridge: G2Bridge) => void = () => undefined;
    const connect = vi
      .fn<() => Promise<G2Bridge>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(second.bridge);
    const adapter = new G2Adapter({ connect });

    const firstStart = adapter.start();
    await adapter.stop();
    const secondStart = adapter.start();
    resolveFirst(first.bridge);

    await expect(firstStart).rejects.toThrow("G2 startup was interrupted");
    await secondStart;
    expect(first.bridge.createStartUpPageContainer).not.toHaveBeenCalled();
    expect(second.bridge.createStartUpPageContainer).toHaveBeenCalledOnce();
    expect(adapter.isRunning).toBe(true);
  });
});
