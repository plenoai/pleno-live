const STORAGE_KEY = "pleno-live:g2-session";
const SCHEMA_VERSION = 1;
const MAX_TRANSCRIPT_LENGTH = 20_000;
const MAX_RESUME_AGE_MS = 5 * 60 * 1_000;
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1_000;

export type StoredG2Session = {
  finalText: string;
  elapsedMs: number;
  shouldResume: boolean;
  savedAt: number;
};

type StoredPayload = StoredG2Session & { version: typeof SCHEMA_VERSION };

function isStoredPayload(value: unknown): value is StoredPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<StoredPayload>;
  return (
    candidate.version === SCHEMA_VERSION &&
    typeof candidate.finalText === "string" &&
    candidate.finalText.length <= MAX_TRANSCRIPT_LENGTH &&
    typeof candidate.elapsedMs === "number" &&
    Number.isFinite(candidate.elapsedMs) &&
    candidate.elapsedMs >= 0 &&
    typeof candidate.shouldResume === "boolean" &&
    typeof candidate.savedAt === "number" &&
    Number.isFinite(candidate.savedAt)
  );
}

export function loadG2Session(
  storage: Storage = localStorage,
  now = Date.now(),
): StoredG2Session | null {
  const serialized = storage.getItem(STORAGE_KEY);
  if (!serialized) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(serialized);
    if (!isStoredPayload(payload)) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }

    const ageMs = now - payload.savedAt;
    if (ageMs < 0 || ageMs > MAX_SESSION_AGE_MS) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }

    const { version: _, ...session } = payload;
    return {
      ...session,
      shouldResume: session.shouldResume && ageMs <= MAX_RESUME_AGE_MS,
    };
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearG2Session(storage: Storage = localStorage): void {
  storage.removeItem(STORAGE_KEY);
}

export function saveG2Session(
  session: StoredG2Session,
  storage: Storage = localStorage,
): void {
  const payload: StoredPayload = {
    ...session,
    finalText: session.finalText.slice(-MAX_TRANSCRIPT_LENGTH),
    version: SCHEMA_VERSION,
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
