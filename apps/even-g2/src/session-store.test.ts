import { describe, expect, it } from "vitest";

import {
  clearG2Session,
  loadG2Session,
  saveG2Session,
  type StoredG2Session,
} from "./session-store";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("G2 session storage", () => {
  it("round-trips a versioned session", () => {
    const storage = new MemoryStorage();
    const session: StoredG2Session = {
      finalText: "Meeting note",
      elapsedMs: 4_200,
      shouldResume: true,
      savedAt: 123,
    };

    saveG2Session(session, storage);

    expect(loadG2Session(storage, 200)).toEqual(session);
  });

  it("does not reopen the microphone from an old resume marker", () => {
    const storage = new MemoryStorage();
    saveG2Session(
      {
        finalText: "Kept locally",
        elapsedMs: 4_200,
        shouldResume: true,
        savedAt: 1_000,
      },
      storage,
    );

    expect(loadG2Session(storage, 301_001)).toMatchObject({
      finalText: "Kept locally",
      shouldResume: false,
    });
  });

  it("expires transcript state after one day and supports explicit clearing", () => {
    const storage = new MemoryStorage();
    saveG2Session(
      {
        finalText: "Sensitive text",
        elapsedMs: 1_000,
        shouldResume: false,
        savedAt: 1_000,
      },
      storage,
    );

    expect(loadG2Session(storage, 86_401_001)).toBeNull();
    saveG2Session(
      {
        finalText: "Another text",
        elapsedMs: 1_000,
        shouldResume: false,
        savedAt: 1_000,
      },
      storage,
    );
    clearG2Session(storage);
    expect(storage.length).toBe(0);
  });

  it("removes malformed state instead of trusting it", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "pleno-live:g2-session",
      '{"version":0,"finalText":"stale"}',
    );

    expect(loadG2Session(storage)).toBeNull();
    expect(storage.length).toBe(0);
  });
});
