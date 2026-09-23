/**
 * FileSystem Types
 * 循環参照を避けるために型定義を分離
 */

export enum EncodingType {
  UTF8 = 'utf8',
  Base64 = 'base64',
}

export interface PlatformFileSystem {
  readonly documentDirectory: string | null;
  readonly cacheDirectory: string | null;
  readonly EncodingType: typeof EncodingType;

  readAsBase64(uri: string): Promise<string>;
  readAsBase64Range(uri: string, position: number, length: number): Promise<string>;
  writeAsBase64(uri: string, base64: string): Promise<void>;
  writeAsString(uri: string, content: string, options?: { encoding?: EncodingType }): Promise<void>;
  moveAsync(from: string, to: string): Promise<void>;
  makeDirectoryAsync(path: string, options?: { intermediates?: boolean }): Promise<void>;
  getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }>;
  deleteAsync(uri: string): Promise<void>;

  /**
   * Blob を Base64 文字列に変換
   * Web版では録音データの保存に使用
   */
  blobToBase64(blob: Blob): Promise<string>;
}
