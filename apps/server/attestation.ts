import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/types";
import {
  storeCredential,
  getCredentialsByDevice,
  getCredentialById,
  updateCredentialCounter,
} from "./credential-store";

const CHALLENGE_TTL = "5m";
const ALGORITHM = "HS256";

function getChallengeSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 bytes");
  }
  return new TextEncoder().encode(raw);
}

function getRpConfig() {
  const rpID = process.env.WEBAUTHN_RP_ID || "plenoai.com";
  const originsRaw = process.env.WEBAUTHN_RP_ORIGINS || "https://plenoai.com";
  const expectedOrigins = originsRaw.split(",").map((o) => o.trim()).filter(Boolean);
  return { rpID, expectedOrigins };
}

type ChallengeToken = {
  challenge: string;
  deviceId: string;
};

async function signChallengeToken(payload: ChallengeToken): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(CHALLENGE_TTL)
    .sign(getChallengeSecret());
}

async function verifyChallengeToken(token: string): Promise<ChallengeToken | null> {
  const result = await jwtVerify(token, getChallengeSecret(), {
    algorithms: [ALGORITHM],
  }).catch(() => null);

  if (!result) return null;

  const { challenge, deviceId } = result.payload as Record<string, unknown>;
  if (typeof challenge !== "string" || typeof deviceId !== "string") return null;

  return { challenge, deviceId };
}

export async function beginRegistration(
  deviceId: string,
  platform: string,
): Promise<{ options: ReturnType<typeof generateRegistrationOptions> extends Promise<infer T> ? T : never; challengeToken: string }> {
  const { rpID } = getRpConfig();

  const options = await generateRegistrationOptions({
    rpName: "Pleno Live",
    rpID,
    userName: deviceId,
    userDisplayName: `Device ${platform}`,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challengeToken = await signChallengeToken({
    challenge: options.challenge,
    deviceId,
  });

  return { options, challengeToken };
}

export async function completeRegistration(
  challengeToken: string,
  response: RegistrationResponseJSON,
  platform: string,
): Promise<{ ok: true; deviceId: string; sessionToken?: string } | { ok: false; error: string }> {
  const payload = await verifyChallengeToken(challengeToken);
  if (!payload) {
    return { ok: false, error: "Invalid or expired challenge token" };
  }

  const { rpID, expectedOrigins } = getRpConfig();

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: payload.challenge,
    expectedOrigin: expectedOrigins,
    expectedRPID: rpID,
  }).catch((e) => ({ verified: false, error: String(e) }));

  if (!verification.verified || !("registrationInfo" in verification) || !verification.registrationInfo) {
    return { ok: false, error: "Registration verification failed" };
  }

  const { credential } = verification.registrationInfo;

  await storeCredential({
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: (response.response.transports as string[]) || [],
    deviceId: payload.deviceId,
    platform,
    createdAt: Date.now(),
  });

  return { ok: true, deviceId: payload.deviceId };
}

export async function beginAuthentication(
  deviceId: string,
): Promise<{ options: ReturnType<typeof generateAuthenticationOptions> extends Promise<infer T> ? T : never; challengeToken: string } | null> {
  const { rpID } = getRpConfig();
  const credentials = await getCredentialsByDevice(deviceId);

  if (credentials.length === 0) return null;

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports as any,
    })),
    userVerification: "preferred",
  });

  const challengeToken = await signChallengeToken({
    challenge: options.challenge,
    deviceId,
  });

  return { options, challengeToken };
}

export async function completeAuthentication(
  challengeToken: string,
  response: AuthenticationResponseJSON,
): Promise<{ ok: true; deviceId: string; platform: string } | { ok: false; error: string }> {
  const payload = await verifyChallengeToken(challengeToken);
  if (!payload) {
    return { ok: false, error: "Invalid or expired challenge token" };
  }

  const { rpID, expectedOrigins } = getRpConfig();
  const stored = await getCredentialById(response.id, payload.deviceId);

  if (!stored) {
    return { ok: false, error: "Credential not found" };
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: payload.challenge,
    expectedOrigin: expectedOrigins,
    expectedRPID: rpID,
    credential: {
      id: stored.credentialId,
      publicKey: Buffer.from(stored.publicKey, "base64url"),
      counter: stored.counter,
      transports: stored.transports as any,
    },
  }).catch((e) => ({ verified: false, error: String(e) }));

  if (!verification.verified || !("authenticationInfo" in verification) || !verification.authenticationInfo) {
    return { ok: false, error: "Authentication verification failed" };
  }

  await updateCredentialCounter(
    stored.credentialId,
    stored.deviceId,
    verification.authenticationInfo.newCounter,
  );

  return { ok: true, deviceId: stored.deviceId, platform: stored.platform };
}

// Legacy HMAC exports - kept for migration period fallback
export { createChallenge, verifyClientResponse } from "./attestation-hmac";
