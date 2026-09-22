import { afterEach, describe, expect, it, vi } from "vitest";

import { callMutation } from "./trpc";

const API_URL = "http://localhost:3000";

function mockFetch(response: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      json: async () => response,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callMutation", () => {
  it("decodes a superjson envelope and restores Date fields", async () => {
    mockFetch([
      {
        result: {
          data: {
            json: { text: "hello", at: "1970-01-01T00:00:00.000Z" },
            meta: { values: { at: ["Date"] }, v: 1 },
          },
        },
      },
    ]);

    const result = await callMutation<{ texts: string[] }, { text: string; at: Date }>(
      "ai.translate",
      { texts: ["x"] },
    );

    expect(result.text).toBe("hello");
    expect(result.at).toBeInstanceOf(Date);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_URL}/api/trpc/ai.translate?batch=1`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ 0: { json: { texts: ["x"] } } }),
      }),
    );
  });

  it("throws the server message on an RPC error", async () => {
    mockFetch(
      [{ error: { json: { message: "音声ファイルが大きすぎます（上限100MB）" } } }],
      500,
    );

    await expect(
      callMutation("ai.transcribe", { audioBase64: "x" }),
    ).rejects.toThrow("音声ファイルが大きすぎます（上限100MB）");
  });
});
