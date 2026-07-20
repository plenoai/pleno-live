import "./styles.css";

export type UiState = "connecting" | "ready" | "listening" | "paused" | "error";

export interface UiTranscriptSegment {
  readonly id: string;
  readonly text: string;
  readonly isPartial: boolean;
  /** Seconds since the recording started. */
  readonly timestamp: number;
  readonly speaker?: string;
}

export interface UiSnapshot {
  readonly state: UiState;
  readonly elapsedMs: number;
  readonly transcript: readonly UiTranscriptSegment[];
  readonly errorMessage?: string;
}

export interface MountUiOptions {
  readonly root?: HTMLElement;
  readonly onToggle: (state: UiState) => void | Promise<void>;
}

export interface MountedUi {
  update(snapshot: UiSnapshot): void;
  destroy(): void;
}

interface StatePresentation {
  readonly status: string;
  readonly title: string;
  readonly detail: string;
  readonly action: "waiting" | "start" | "pause" | "resume" | "retry";
  readonly buttonLabel: string;
  readonly disabled: boolean;
}

const MAX_VISIBLE_SEGMENTS = 80;

const STATE_PRESENTATION: Record<UiState, StatePresentation> = {
  connecting: {
    status: "眼鏡と接続中",
    title: "Even G2 を探しています",
    detail: "眼鏡を近くに置いたままお待ちください。",
    action: "waiting",
    buttonLabel: "接続を待っています",
    disabled: true,
  },
  ready: {
    status: "準備完了",
    title: "会話を記録できます",
    detail: "眼鏡の操作を邪魔せず、スマホからも開始できます。",
    action: "start",
    buttonLabel: "録音を開始",
    disabled: false,
  },
  listening: {
    status: "録音中",
    title: "会話を記録しています",
    detail: "文字起こしは話した内容に合わせて更新されます。",
    action: "pause",
    buttonLabel: "一時停止",
    disabled: false,
  },
  paused: {
    status: "一時停止",
    title: "記録を一時停止しています",
    detail: "再開すると同じセッションに続けて記録します。",
    action: "resume",
    buttonLabel: "録音を再開",
    disabled: false,
  },
  error: {
    status: "接続エラー",
    title: "眼鏡との接続を確認してください",
    detail: "Bluetooth と Even Hub の接続を確認して、もう一度お試しください。",
    action: "retry",
    buttonLabel: "接続を再試行",
    disabled: false,
  },
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatElapsed(elapsedMs: number): string {
  const seconds = Math.floor(
    Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1_000,
  );
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatTimestamp(timestamp: number): string {
  const seconds = Math.floor(
    Math.max(0, Number.isFinite(timestamp) ? timestamp : 0),
  );
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function transcriptKey(segments: readonly UiTranscriptSegment[]): string {
  return JSON.stringify(
    segments
      .slice(-MAX_VISIBLE_SEGMENTS)
      .map((segment) => [
        segment.id,
        segment.text,
        segment.isPartial,
        segment.timestamp,
        segment.speaker,
      ]),
  );
}

export function mountUi({ root, onToggle }: MountUiOptions): MountedUi {
  const mountPoint = root ?? document.getElementById("app");
  if (!mountPoint) {
    throw new Error("Pleno Live UI requires an #app mount point.");
  }

  const shell = element("div", "pleno-ui");
  shell.dataset.state = "connecting";

  const consolePanel = element("main", "pleno-console");
  consolePanel.setAttribute("aria-labelledby", "pleno-page-title");

  const header = element("header", "pleno-header");
  const brand = element("div", "pleno-brand");
  const brandMark = element("span", "pleno-brand__mark", "P");
  brandMark.setAttribute("aria-hidden", "true");
  const brandCopy = element("div", "pleno-brand__copy");
  const brandName = element("p", "pleno-brand__name", "PLENO LIVE");
  const pageTitle = element("h1", "pleno-brand__title", "眼鏡で残す会話");
  pageTitle.id = "pleno-page-title";
  brandCopy.append(brandName, pageTitle);
  brand.append(brandMark, brandCopy);

  const statusChip = element("div", "pleno-status");
  statusChip.setAttribute("role", "status");
  statusChip.setAttribute("aria-live", "polite");
  const statusDot = element("span", "pleno-status__dot");
  statusDot.setAttribute("aria-hidden", "true");
  const statusLabel = element("span", "pleno-status__label");
  statusChip.append(statusDot, statusLabel);
  header.append(brand, statusChip);

  const session = element("section", "pleno-session");
  const instrument = element("div", "pleno-instrument");
  const meter = element("div", "pleno-meter");
  const meterCore = element("div", "pleno-meter__core");
  const timerLabel = element("span", "pleno-meter__label", "経過時間");
  const timer = element("output", "pleno-meter__time", "00:00");
  const meterState = element("span", "pleno-meter__state");
  meterCore.append(timerLabel, timer, meterState);
  meter.append(meterCore);
  instrument.append(meter);

  const sessionCopy = element("div", "pleno-session__copy");
  const sessionKicker = element("p", "pleno-kicker", "SESSION MONITOR");
  const sessionTitle = element("h2", "pleno-session__title");
  sessionTitle.id = "pleno-session-title";
  const sessionDetail = element("p", "pleno-session__detail");
  const toggleButton = element("button", "pleno-action");
  toggleButton.type = "button";
  const actionIcon = element("span", "pleno-action__icon");
  actionIcon.setAttribute("aria-hidden", "true");
  const actionLabel = element("span", "pleno-action__label");
  toggleButton.append(actionIcon, actionLabel);
  const actionFeedback = element("p", "pleno-action__feedback");
  actionFeedback.setAttribute("role", "alert");
  actionFeedback.hidden = true;
  sessionCopy.append(
    sessionKicker,
    sessionTitle,
    sessionDetail,
    toggleButton,
    actionFeedback,
  );
  session.append(instrument, sessionCopy);

  const transcript = element("section", "pleno-transcript");
  transcript.setAttribute("aria-labelledby", "pleno-transcript-title");
  const transcriptHeader = element("header", "pleno-transcript__header");
  const transcriptHeadingGroup = element("div");
  const transcriptKicker = element("p", "pleno-kicker", "LIVE TRANSCRIPT");
  const transcriptTitle = element(
    "h2",
    "pleno-transcript__title",
    "文字起こし",
  );
  transcriptTitle.id = "pleno-transcript-title";
  transcriptHeadingGroup.append(transcriptKicker, transcriptTitle);
  const transcriptCount = element("span", "pleno-transcript__count", "確定 0");
  transcriptHeader.append(transcriptHeadingGroup, transcriptCount);

  const transcriptLog = element("div", "pleno-transcript__log");
  transcriptLog.setAttribute("role", "log");
  transcriptLog.setAttribute("aria-live", "polite");
  transcriptLog.setAttribute("aria-relevant", "additions text");
  transcriptLog.setAttribute("aria-atomic", "false");
  transcriptLog.tabIndex = 0;
  transcript.append(transcriptHeader, transcriptLog);

  const privacy = element("footer", "pleno-privacy");
  const privacyMark = element("span", "pleno-privacy__mark");
  privacyMark.setAttribute("aria-hidden", "true");
  const privacyCopy = element("p", "pleno-privacy__copy");
  const privacyTitle = element(
    "strong",
    "pleno-privacy__title",
    "録音はあなたの操作で始まります",
  );
  const privacyDetail = element(
    "span",
    "pleno-privacy__detail",
    "音声は文字起こしのため送信され、このプラグイン内には保存されません。文字起こしは復旧用に端末内へ最大24時間保持され、終了時に削除されます。周囲の同意を確認してください。",
  );
  privacyCopy.append(privacyTitle, privacyDetail);
  privacy.append(privacyMark, privacyCopy);

  consolePanel.append(header, session, transcript, privacy);
  shell.append(consolePanel);
  mountPoint.replaceChildren(shell);

  let currentSnapshot: UiSnapshot = {
    state: "connecting",
    elapsedMs: 0,
    transcript: [],
  };
  let lastTranscriptKey = "";
  let actionPending = false;
  let destroyed = false;

  const renderAction = (presentation: StatePresentation): void => {
    toggleButton.dataset.action = presentation.action;
    toggleButton.disabled = presentation.disabled || actionPending;
    toggleButton.setAttribute("aria-busy", String(actionPending));
    actionLabel.textContent = actionPending
      ? "処理しています"
      : presentation.buttonLabel;
    toggleButton.setAttribute(
      "aria-label",
      actionPending ? "操作を処理しています" : presentation.buttonLabel,
    );
  };

  const renderState = (): void => {
    const presentation = STATE_PRESENTATION[currentSnapshot.state];
    shell.dataset.state = currentSnapshot.state;
    statusLabel.textContent = presentation.status;
    meterState.textContent = presentation.status;
    sessionTitle.textContent = presentation.title;
    sessionDetail.textContent =
      currentSnapshot.state === "error" && currentSnapshot.errorMessage
        ? currentSnapshot.errorMessage
        : presentation.detail;
    timer.textContent = formatElapsed(currentSnapshot.elapsedMs);
    timer.setAttribute(
      "aria-label",
      `録音経過時間 ${formatElapsed(currentSnapshot.elapsedMs)}`,
    );
    renderAction(presentation);
  };

  const renderTranscript = (): void => {
    const segments = currentSnapshot.transcript;
    const visibleSegments = segments.slice(-MAX_VISIBLE_SEGMENTS);
    const wasPinnedToBottom =
      transcriptLog.scrollHeight -
        transcriptLog.scrollTop -
        transcriptLog.clientHeight <
      48;
    const previousScrollTop = transcriptLog.scrollTop;
    const fragment = document.createDocumentFragment();

    if (segments.length > visibleSegments.length) {
      const omitted = element(
        "p",
        "pleno-transcript__omitted",
        `この画面では直近${MAX_VISIBLE_SEGMENTS}件を表示しています（以前の${segments.length - visibleSegments.length}件を省略）`,
      );
      fragment.append(omitted);
    }

    if (visibleSegments.length === 0) {
      const empty = element("div", "pleno-transcript__empty");
      const emptySignal = element("span", "pleno-transcript__empty-signal");
      emptySignal.setAttribute("aria-hidden", "true");
      const emptyText = element(
        "p",
        undefined,
        currentSnapshot.state === "listening"
          ? "声を検出すると、ここに文字起こしが表示されます。"
          : "録音を始めると、ここで内容を確認できます。",
      );
      empty.append(emptySignal, emptyText);
      fragment.append(empty);
    } else {
      for (const segment of visibleSegments) {
        const row = element(
          "article",
          `pleno-line${segment.isPartial ? " pleno-line--partial" : ""}`,
        );
        row.dataset.segmentId = segment.id;

        const meta = element("div", "pleno-line__meta");
        const timestamp = element(
          "time",
          "pleno-line__time",
          formatTimestamp(segment.timestamp),
        );
        const source = element(
          "span",
          "pleno-line__source",
          segment.speaker ? `話者 ${segment.speaker}` : "Even G2",
        );
        const phase = element(
          "span",
          "pleno-line__phase",
          segment.isPartial ? "認識中" : "確定",
        );
        meta.append(timestamp, source, phase);

        const text = element("p", "pleno-line__text");
        text.textContent = segment.text.trim() || "…";
        row.append(meta, text);
        fragment.append(row);
      }
    }

    transcriptLog.replaceChildren(fragment);
    transcriptCount.textContent = `確定 ${segments.filter((segment) => !segment.isPartial).length}`;

    if (wasPinnedToBottom) {
      transcriptLog.scrollTop = transcriptLog.scrollHeight;
    } else {
      transcriptLog.scrollTop = previousScrollTop;
    }
  };

  const handleToggle = async (): Promise<void> => {
    const presentation = STATE_PRESENTATION[currentSnapshot.state];
    if (presentation.disabled || actionPending || destroyed) return;

    actionPending = true;
    actionFeedback.hidden = true;
    renderAction(presentation);

    try {
      await onToggle(currentSnapshot.state);
    } catch {
      actionFeedback.textContent =
        "操作を完了できませんでした。接続を確認してください。";
      actionFeedback.hidden = false;
    } finally {
      actionPending = false;
      if (!destroyed) renderAction(STATE_PRESENTATION[currentSnapshot.state]);
    }
  };

  toggleButton.addEventListener("click", handleToggle);

  const update = (snapshot: UiSnapshot): void => {
    if (destroyed) return;

    const stateChanged = snapshot.state !== currentSnapshot.state;
    currentSnapshot = snapshot;
    if (stateChanged) actionFeedback.hidden = true;
    renderState();

    const nextTranscriptKey = `${snapshot.state}:${transcriptKey(snapshot.transcript)}`;
    if (nextTranscriptKey !== lastTranscriptKey) {
      lastTranscriptKey = nextTranscriptKey;
      renderTranscript();
    }
  };

  update(currentSnapshot);

  return {
    update,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      toggleButton.removeEventListener("click", handleToggle);
      shell.remove();
    },
  };
}
