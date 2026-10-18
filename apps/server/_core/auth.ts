import { SignJWT, jwtVerify } from "jose";

const SESSION_TTL = "1h";
const ALGORITHM = "HS256";

export type SessionPayload = {
  deviceId: string;
  platform: string;
};

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 bytes");
  }
  return new TextEncoder().encode(raw);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ deviceId: payload.deviceId, platform: payload.platform })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: [ALGORITHM],
  });

  const deviceId = payload.deviceId;
  const platform = payload.platform;

  if (typeof deviceId !== "string" || typeof platform !== "string") {
    throw new Error("Invalid session token payload");
  }

  return { deviceId, platform };
}
