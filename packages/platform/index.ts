/**
 * Platform Abstraction Layer
 *
 * iOS/Android/Webのプラットフォーム差異を抽象化し、
 * 統一されたインターフェースを提供します。
 */

export { Storage } from './storage';
export type { PlatformStorage } from './storage';

export { Haptics } from './haptics';
export type { HapticFeedbackStyle, HapticNotificationType } from './haptics';

export { FileSystem } from './filesystem';
export type { PlatformFileSystem } from './filesystem';

export { Permissions } from './permissions';
export type { PermissionStatus, PlatformPermissions } from './permissions';

export { createAudioStream } from './audio-stream';
export type { AudioStreamConfig, AudioStreamController, AudioStreamResult } from './audio-stream';

export { BackgroundTask } from './background-task';
export type { PlatformBackgroundTask } from './background-task';

