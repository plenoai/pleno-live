import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SignJWT } from "jose";

const STORE_KEY_SESSION_TOKEN = "auth.sessionToken";
const STORE_KEY_EXPIRES_AT = "auth.expiresAt";
const STORE_KEY_DEVICE_ID = "auth.deviceId";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const APP_HMAC_SECRET = process.env.EXPO_PUBLIC_APP_HMAC_SECRET || "";

type TRPCClient = {
  auth: {
    createChallenge: {
      mutate: () => Promise<{ nonce: string; challengeToken: string }>;
    };
    verifyAttestation: {
      mutate: (input: {
        responseToken: string;
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
  };
};

let sessionToken: string | null = null;
let expiresAt: number | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let trpcClientRef: TRPCClient | null = null;

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
  const existing = await SecureStore.getItemAsync(STORE_KEY_DEVICE_ID);
  if (existing) return existing;

  const id = generateUUID();
  await SecureStore.setItemAsync(STORE_KEY_DEVICE_ID, id);
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
  const storedToken = await SecureStore.getItemAsync(STORE_KEY_SESSION_TOKEN);
  const storedExpiry = await SecureStore.getItemAsync(STORE_KEY_EXPIRES_AT);

  if (!storedToken || !storedExpiry) return false;

  const expiry = Number(storedExpiry);
  if (Number.isNaN(expiry)) return false;
  if (Date.now() >= expiry) return false;

  sessionToken = storedToken;
  expiresAt = expiry;
  return true;
}

async function storeSession(token: string, expiry: number): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY_SESSION_TOKEN, token);
  await SecureStore.setItemAsync(STORE_KEY_EXPIRES_AT, String(expiry));
  sessionToken = token;
  expiresAt = expiry;
}

async function signChallengeResponse(nonce: string): Promise<string> {
  const secret = new TextEncoder().encode(APP_HMAC_SECRET);

  return new SignJWT({ nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(secret);
}

async function performAuthFlow(): Promise<void> {
  if (!trpcClientRef) return;
  if (!APP_HMAC_SECRET) {
    if (__DEV__) return;
    throw new Error("APP_HMAC_SECRET is not configured");
  }

  const deviceId = await getOrCreateDeviceId();
  const { nonce, challengeToken } =
    await trpcClientRef.auth.createChallenge.mutate();

  const responseToken = await signChallengeResponse(nonce);

  const result = await trpcClientRef.auth.verifyAttestation.mutate({
    responseToken,
    challengeToken,
    platform: Platform.OS,
    deviceId,
  });

  if (!result.success || !result.sessionToken) {
    throw new Error(result.error || "Authentication failed");
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

  if (!APP_HMAC_SECRET && __DEV__) return;
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
