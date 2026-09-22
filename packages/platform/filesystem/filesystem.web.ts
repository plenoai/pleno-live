/**
 * Web FileSystem Implementation
 * Web では Blob API と Data URI を使用
 */

import { EncodingType, type PlatformFileSystem } from './types';

// Web版のファイルストレージ（メモリ内）
const fileStorage = new Map<string, string>();

export const FileSystem: PlatformFileSystem = {
  get documentDirectory(): string | null {
    // Web では仮想的なディレクトリパスを返す
    return 'web-storage://';
  },

  get cacheDirectory(): string | null {
    // Web では仮想的なキャッシュディレクトリパスを返す
    return 'web-cache://';
  },

  EncodingType,

  async readAsBase64(uri: string): Promise<string> {
    // Data URI の場合
    if (uri.startsWith('data:')) {
      const base64 = uri.split(',')[1];
      return base64 || '';
    }

    // メモリストレージから取得
    const data = fileStorage.get(uri);
    if (data) {
      return data;
    }

    // Blob URL の場合
    if (uri.startsWith('blob:')) {
      const response = await fetch(uri);
      const blob = await response.blob();
      return this.blobToBase64(blob);
    }

    throw new Error(`File not found: ${uri}`);
  },

  async readAsBase64Range(uri: string, position: number, length: number): Promise<string> {
    const base64 = await this.readAsBase64(uri);
    const binary = atob(base64);
    const bytes = new Uint8Array(Math.min(length, Math.max(0, binary.length - position)));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = binary.charCodeAt(position + i);
    }
    let out = '';
    for (const b of bytes) out += String.fromCharCode(b);
    return btoa(out);
  },

  async writeAsBase64(uri: string, base64: string): Promise<void> {
    fileStorage.set(uri, base64);
  },

  async writeAsString(uri: string, content: string, options?: { encoding?: EncodingType }): Promise<void> {
    if (options?.encoding === EncodingType.Base64) {
      // Base64エンコーディングが指定されている場合
      const encoded = btoa(content);
      fileStorage.set(uri, encoded);
    } else {
      // UTF-8（デフォルト）
      fileStorage.set(uri, content);
    }
  },

  async moveAsync(from: string, to: string): Promise<void> {
    const data = fileStorage.get(from);
    if (data) {
      fileStorage.set(to, data);
      fileStorage.delete(from);
    }
  },

  async makeDirectoryAsync(_path: string, _options?: { intermediates?: boolean }): Promise<void> {
    // Web ではディレクトリ作成は不要
  },

  async getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }> {
    if (uri.startsWith('data:')) {
      const base64 = uri.split(',')[1] || '';
      return { exists: true, size: base64.length };
    }

    const data = fileStorage.get(uri);
    if (data) {
      return { exists: true, size: data.length };
    }

    return { exists: false };
  },

  async deleteAsync(uri: string): Promise<void> {
    fileStorage.delete(uri);
  },

  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },
};
