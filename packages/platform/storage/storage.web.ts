/**
 * Web Storage Implementation
 * IndexedDB を使用して大容量データを保存する
 *
 * localStorage は ~5MB の容量制限があり、音声データの base64 保存には不向き。
 * IndexedDB は数百MB〜数GB を扱えるため、音声データを含む録音の永続化に適している。
 */

import type { PlatformStorage } from './index';

const DB_NAME = 'pleno_live_storage';
const DB_VERSION = 1;
const STORE_NAME = 'keyvalue';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withDB<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDB();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export const Storage: PlatformStorage = {
  async getItem(key: string): Promise<string | null> {
    return withDB(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const request = tx.objectStore(STORE_NAME).get(key);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
        })
    );
  },

  async setItem(key: string, value: string): Promise<void> {
    return withDB(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const request = tx.objectStore(STORE_NAME).put(value, key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
    );
  },

  async removeItem(key: string): Promise<void> {
    return withDB(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const request = tx.objectStore(STORE_NAME).delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
    );
  },

  async clear(): Promise<void> {
    return withDB(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const request = tx.objectStore(STORE_NAME).clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
    );
  },

  async getAllKeys(): Promise<string[]> {
    return withDB(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const request = tx.objectStore(STORE_NAME).getAllKeys();
          request.onsuccess = () => resolve(request.result as string[]);
          request.onerror = () => reject(request.error);
        })
    );
  },
};
