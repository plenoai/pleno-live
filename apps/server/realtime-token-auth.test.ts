import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedRealtimeTokenRequest } from "./realtime-token-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAuthorizedRealtimeTokenRequest", () => {
  it("accepts the configured bearer credential", () => {
    vi.stubEnv("APP_HMAC_SECRET", "deployment-secret");
    expect(
      isAuthorizedRealtimeTokenRequest("Bearer deployment-secret"),
    ).toBe(true);
  });

  it.each([
    [undefined],
    ["Bearer wrong-secret"],
    ["Basic deployment-secret"],
  ])(
    "rejects an invalid or unconfigured credential",
    (authorization) => {
      vi.stubEnv("APP_HMAC_SECRET", "deployment-secret");
      expect(isAuthorizedRealtimeTokenRequest(authorization)).toBe(false);
    },
  );

  it("rejects every request while the secret is unconfigured", () => {
    vi.stubEnv("APP_HMAC_SECRET", "");
    expect(
      isAuthorizedRealtimeTokenRequest("Bearer deployment-secret"),
    ).toBe(false);
  });
});
