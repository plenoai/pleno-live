/**
 * Native (iOS/Android) FileSystem Implementation
 * expo-file-system をラップして統一インターフェースを提供
 */

import * as ExpoFileSystem from 'expo-file-system/legacy';
import { EncodingType, type PlatformFileSystem } from './types';

export const FileSystem: PlatformFileSystem = {
  get documentDirectory(): string | null {
    return ExpoFileSystem.documentDirectory;
  },

  get cacheDirectory(): string | null {
    return ExpoFileSystem.cacheDirectory;
  },

  EncodingType,

  async readAsBase64(uri: string): Promise<string> {
    return ExpoFileSystem.readAsStringAsync(uri, {
      encoding: ExpoFileSystem.EncodingType.Base64,
    });
  },

  async readAsBase64Range(uri: string, position: number, length: number): Promise<string> {
    return ExpoFileSystem.readAsStringAsync(uri, {
      encoding: ExpoFileSystem.EncodingType.Base64,
      position,
      length,
    });
  },

  async writeAsBase64(uri: string, base64: string): Promise<void> {
    await ExpoFileSystem.writeAsStringAsync(uri, base64, {
      encoding: ExpoFileSystem.EncodingType.Base64,
    });
  },

  async writeAsString(uri: string, content: string, options?: { encoding?: EncodingType }): Promise<void> {
    const encoding = options?.encoding === EncodingType.Base64
      ? ExpoFileSystem.EncodingType.Base64
      : ExpoFileSystem.EncodingType.UTF8;
    await ExpoFileSystem.writeAsStringAsync(uri, content, { encoding });
  },

  async moveAsync(from: string, to: string): Promise<void> {
    await ExpoFileSystem.moveAsync({ from, to });
  },

  async makeDirectoryAsync(path: string, options?: { intermediates?: boolean }): Promise<void> {
    await ExpoFileSystem.makeDirectoryAsync(path, options);
  },

  async getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }> {
    const info = await ExpoFileSystem.getInfoAsync(uri);
    return {
      exists: info.exists,
      size: info.exists ? info.size : undefined,
    };
  },

  async deleteAsync(uri: string): Promise<void> {
    await ExpoFileSystem.deleteAsync(uri, { idempotent: true });
  },

  async blobToBase64(_blob: Blob): Promise<string> {
    // Native では通常使用しないが、互換性のために実装
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(_blob);
    });
  },
};
