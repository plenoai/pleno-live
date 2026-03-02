/**
 * Legacy HMAC Challenge-Response attestation
 * Kept for migration period - Android 9未満などPasskey非対応デバイス向けフォールバック
 * @deprecated WebAuthn/Passkey移行完了後に削除予定
 */
import { SignJWT, jwtVerify } from "jose";
import { createHash, timingSafeEqual, randomBytes } from "crypto";

const CHALLENGE_TTL = "5m";
const ALGORITHM = "HS256";

function getChallengeSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 bytes");
  }
  return new TextEncoder().encode(raw);
}

function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

type ChallengeResult = {
  nonce: string;
  challengeToken: string;
};

export async function createChallenge(): Promise<ChallengeResult> {
  const nonce = generateNonce();

  const challengeToken = await new SignJWT({ nonce })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(CHALLENGE_TTL)
    .sign(getChallengeSecret());

  return { nonce, challengeToken };
}

export async function verifyClientResponse(
  challengeToken: string,
  responseHash: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const challengeResult = await jwtVerify(challengeToken, getChallengeSecret(), {
    algorithms: [ALGORITHM],
  }).catch(() => null);

  if (!challengeResult) {
    return { ok: false, error: "Invalid or expired challenge token" };
  }

  const nonce = challengeResult.payload.nonce;
  if (typeof nonce !== "string") {
    return { ok: false, error: "Challenge token missing nonce" };
  }

  const secret = process.env.APP_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    return { ok: false, error: "Server misconfigured" };
  }

  const expected = createHash("sha256")
    .update(secret + ":" + nonce)
    .digest("hex");

  if (expected.length !== responseHash.length) {
    return { ok: false, error: "Invalid response" };
  }

  const isValid = timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(responseHash),
  );

  if (!isValid) {
    return { ok: false, error: "Invalid response" };
  }

  return { ok: true };
}
