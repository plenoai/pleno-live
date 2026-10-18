import { describe, expect, it, vi } from "vitest";

import { createRealtimeTokenProvider } from "./token-provider";

describe("createRealtimeTokenProvider", () => {
  it("requests a short-lived token without sending credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ token: "single-use" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const token = await createRealtimeTokenProvider(
      "https://api.example.test/",
      fetchImpl,
      "token-secret",
    )();

    expect(token).toBe("single-use");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.test/api/even-g2/realtime-token",
      {
        method: "POST",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer token-secret",
        },
      },
    );
  });

  it("rejects malformed responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ token: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      createRealtimeTokenProvider("https://api.example.test", fetchImpl)(),
    ).rejects.toThrow("Token response was invalid");
  });
});
