import { timingSafeEqual } from "node:crypto";

const BEARER_PREFIX = "Bearer ";

/**
 * OpenAI credentials must only be issued to clients that know the deployment's
 * realtime-token authorization secret. Missing configuration fails closed.
 */
export function isAuthorizedRealtimeTokenRequest(
  authorization: string | undefined,
  secret = process.env.APP_HMAC_SECRET,
): boolean {
  if (!secret || !authorization?.startsWith(BEARER_PREFIX)) {
    return false;
  }

  const provided = Buffer.from(authorization.slice(BEARER_PREFIX.length));
  const expected = Buffer.from(secret);

  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
