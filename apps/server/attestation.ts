import { SignJWT, jwtVerify } from "jose";

const CHALLENGE_TTL = "5m";
const ALGORITHM = "HS256";

function getChallengeSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 bytes");
  }
  return new TextEncoder().encode(raw);
}

function getAppHmacSecret(): Uint8Array {
  const raw = process.env.APP_HMAC_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("APP_HMAC_SECRET must be at least 32 bytes");
  }
  return new TextEncoder().encode(raw);
}

function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  responseToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const challengeResult = await jwtVerify(challengeToken, getChallengeSecret(), {
    algorithms: [ALGORITHM],
  }).catch(() => null);

  if (!challengeResult) {
    return { ok: false, error: "Invalid or expired challenge token" };
  }

  const expectedNonce = challengeResult.payload.nonce;
  if (typeof expectedNonce !== "string") {
    return { ok: false, error: "Challenge token missing nonce" };
  }

  const responseResult = await jwtVerify(responseToken, getAppHmacSecret(), {
    algorithms: [ALGORITHM],
  }).catch(() => null);

  if (!responseResult) {
    return { ok: false, error: "Invalid response signature" };
  }

  const responseNonce = responseResult.payload.nonce;
  if (responseNonce !== expectedNonce) {
    return { ok: false, error: "Nonce mismatch" };
  }

  return { ok: true };
}
