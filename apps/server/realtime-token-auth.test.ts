import { describe, expect, it } from "vitest";
import { isAuthorizedRealtimeTokenRequest } from "./realtime-token-auth";

describe("isAuthorizedRealtimeTokenRequest", () => {
  it("accepts the configured bearer credential", () => {
    expect(
      isAuthorizedRealtimeTokenRequest(
        "Bearer deployment-secret",
        "deployment-secret",
      ),
    ).toBe(true);
  });

  it.each([
    [undefined, "deployment-secret"],
    ["Bearer wrong-secret", "deployment-secret"],
    ["Basic deployment-secret", "deployment-secret"],
    ["Bearer deployment-secret", undefined],
  ])(
    "rejects an invalid or unconfigured credential",
    (authorization, secret) => {
      expect(isAuthorizedRealtimeTokenRequest(authorization, secret)).toBe(
        false,
      );
    },
  );
});
