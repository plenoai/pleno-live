/**
 * Native (iOS/Android) Permissions Implementation
 * expo-audio を使用してマイク許可を管理
 */

import {
  AudioModule,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import type { PlatformPermissions, PermissionStatus } from './index';

function mapPermissionStatus(granted: boolean): PermissionStatus {
  return granted ? 'granted' : 'denied';
}

export const Permissions: PlatformPermissions = {
  async getMicrophonePermission(): Promise<PermissionStatus> {
    try {
      const status = await AudioModule.getRecordingPermissionsAsync();
      return mapPermissionStatus(status.granted);
    } catch {
      return 'undetermined';
    }
  },

  async requestMicrophonePermission(): Promise<PermissionStatus> {
    try {
      // 録音に必要なオーディオモードを設定
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        shouldPlayInBackground: true,
        allowsBackgroundRecording: true,
      });

      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (status.granted) {
        // Android 13+: バックグラウンド録音のFGSに必要
        await requestNotificationPermissionsAsync();
      }
      return mapPermissionStatus(status.granted);
    } catch {
      return 'denied';
    }
  },
};
