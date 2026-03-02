import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { Storage } from "@/packages/platform/storage";
import { Passkey } from "@/packages/platform/passkey";

const STORE_KEY_SESSION_TOKEN = "auth.sessionToken";
const STORE_KEY_EXPIRES_AT = "auth.expiresAt";
const STORE_KEY_DEVICE_ID = "auth.deviceId";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Legacy HMAC secret - used only for Passkey非対応デバイスへのフォールバック
const APP_HMAC_SECRET = process.env.EXPO_PUBLIC_APP_HMAC_SECRET || "";

type TRPCClient = {
  auth: {
    createChallenge: {
      mutate: () => Promise<{ nonce: string; challengeToken: string }>;
    };
    verifyAttestation: {
      mutate: (input: {
        responseHash: string;
        challengeToken: string;
        platform: string;
        deviceId: string;
      }) => Promise<{
        success: boolean;
        sessionToken: string | null;
        expiresAt: number;
        error?: string;
      }>;
    };
    beginRegistration: {
      mutate: (input: { deviceId: string; platform: string }) => Promise<{
        options: Record<string, unknown>;
        challengeToken: string;
      }>;
    };
    completeRegistration: {
      mutate: (input: {
        challengeToken: string;
        response: unknown;
        platform: string;
      }) => Promise<{
        success: boolean;
        sessionToken: string | null;
        expiresAt: number;
        error?: string;
      }>;
    };
    beginAuthentication: {
      mutate: (input: { deviceId: string }) => Promise<{
        options: Record<string, unknown>;
        challengeToken: string;
      } | null>;
    };
    completeAuthentication: {
      mutate: (input: {
        challengeToken: string;
        response: unknown;
      }) => Promise<{
        success: boolean;
        sessionToken: string | null;
        expiresAt: number;
        error?: string;
      }>;
    };
  };
};

let sessionToken: string | null = null;
let expiresAt: number | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let trpcClientRef: TRPCClient | null = null;
let reauthPromise: Promise<void> | null = null;

function generateUUID(): string {
  const bytes = new Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.map((b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await Storage.getItem(STORE_KEY_DEVICE_ID);
  if (existing) return existing;

  const id = generateUUID();
  await Storage.setItem(STORE_KEY_DEVICE_ID, id);
  return id;
}

function isTokenValid(): boolean {
  if (!sessionToken || !expiresAt) return false;
  return Date.now() < expiresAt;
}

function isTokenNearExpiry(): boolean {
  if (!expiresAt) return true;
  return Date.now() >= expiresAt - REFRESH_MARGIN_MS;
}

function scheduleRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  if (!expiresAt) return;

  const refreshAt = expiresAt - REFRESH_MARGIN_MS;
  const delay = Math.max(0, refreshAt - Date.now());

  refreshTimer = setTimeout(() => {
    performAuthFlow().catch(() => {});
  }, delay);
}

async function loadStoredSession(): Promise<boolean> {
  const storedToken = await Storage.getItem(STORE_KEY_SESSION_TOKEN);
  const storedExpiry = await Storage.getItem(STORE_KEY_EXPIRES_AT);

  if (!storedToken || !storedExpiry) return false;

  const expiry = Number(storedExpiry);
  if (Number.isNaN(expiry)) return false;
  if (Date.now() >= expiry) return false;

  sessionToken = storedToken;
  expiresAt = expiry;
  return true;
}

async function storeSession(token: string, expiry: number): Promise<void> {
  await Storage.setItem(STORE_KEY_SESSION_TOKEN, token);
  await Storage.setItem(STORE_KEY_EXPIRES_AT, String(expiry));
  sessionToken = token;
  expiresAt = expiry;
}

async function computeResponseHash(nonce: string): Promise<string> {
  const input = APP_HMAC_SECRET + ":" + nonce;

  if (Platform.OS === "web") {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
  } catch (e) {
    console.error("[Auth] computeResponseHash failed", { platform: Platform.OS, error: String(e) });
    throw e;
  }
}

/**
 * レガシーHMACフロー - Passkey非対応デバイス向けフォールバック
 * @deprecated Passkey移行完了後に削除予定
 */
async function performHMACFallbackFlow(): Promise<void> {
  if (!trpcClientRef) return;
  if (!APP_HMAC_SECRET) {
    if (__DEV__) return;
    throw new Error("APP_HMAC_SECRET is not configured");
  }

  const deviceId = await getOrCreateDeviceId();
  const { nonce, challengeToken } = await trpcClientRef.auth.createChallenge.mutate();
  const responseHash = await computeResponseHash(nonce);

  const result = await trpcClientRef.auth.verifyAttestation.mutate({
    responseHash,
    challengeToken,
    platform: Platform.OS,
    deviceId,
  });

  if (!result.success || !result.sessionToken) {
    console.error("[Auth] HMAC verifyAttestation rejected", { error: result.error, platform: Platform.OS });
    throw new Error(result.error || "Authentication failed");
  }

  await storeSession(result.sessionToken, result.expiresAt);
  scheduleRefresh();
}

async function performAuthFlow(): Promise<void> {
  if (!trpcClientRef) return;

  const passkeySupported = Passkey.isSupported();
  if (!passkeySupported) {
    console.log("[Auth] Passkey not supported, falling back to HMAC");
    return performHMACFallbackFlow();
  }

  const deviceId = await getOrCreateDeviceId();
  const platform = Platform.OS;

  // 既存デバイス: 認証を試みる
  const authBegin = await trpcClientRef.auth.beginAuthentication.mutate({ deviceId });

  if (authBegin) {
    try {
      const assertion = await Passkey.authenticate(authBegin.options as any);
      const result = await trpcClientRef.auth.completeAuthentication.mutate({
        challengeToken: authBegin.challengeToken,
        response: assertion,
      });

      if (!result.success || !result.sessionToken) {
        throw new Error(result.error || "Authentication failed");
      }

      await storeSession(result.sessionToken, result.expiresAt);
      scheduleRefresh();
      return;
    } catch (e) {
      console.error("[Auth] Passkey authentication failed, attempting re-registration", { error: String(e) });
    }
  }

  // 新規デバイスまたは再登録
  const regBegin = await trpcClientRef.auth.beginRegistration.mutate({ deviceId, platform });
  const attestation = await Passkey.register(regBegin.options as any);
  const result = await trpcClientRef.auth.completeRegistration.mutate({
    challengeToken: regBegin.challengeToken,
    response: attestation,
    platform,
  });

  if (!result.success || !result.sessionToken) {
    throw new Error(result.error || "Registration failed");
  }

  await storeSession(result.sessionToken, result.expiresAt);
  scheduleRefresh();
}

export function setTRPCClient(client: TRPCClient): void {
  trpcClientRef = client;
}

export async function initializeAuth(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const hasValid = await loadStoredSession();

  if (hasValid && !isTokenNearExpiry()) {
    scheduleRefresh();
    return;
  }

  if (!trpcClientRef) return;

  await performAuthFlow();
}

export function getSessionToken(): string | null {
  if (!isTokenValid()) return null;
  return sessionToken;
}

export function isAuthInitialized(): boolean {
  return initialized;
}

export async function resetAndReauth(): Promise<void> {
  if (reauthPromise) return reauthPromise;

  reauthPromise = (async () => {
    sessionToken = null;
    expiresAt = null;
    initialized = false;
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    await Storage.removeItem(STORE_KEY_SESSION_TOKEN);
    await Storage.removeItem(STORE_KEY_EXPIRES_AT);
    await initializeAuth();
  })().finally(() => {
    reauthPromise = null;
  });

  return reauthPromise;
}
