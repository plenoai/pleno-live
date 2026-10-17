import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

it("reports the deployed commit without caching the health response", async () => {
  vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "health-test");
  vi.stubEnv("APP_COMMIT", "a".repeat(40));
  const { handler } = await import("./index");
  const response = await handler({ httpMethod: "GET", path: "/api/health", headers: {} }, {});
  expect(response).toMatchObject({
    statusCode: 200,
    body: expect.stringContaining(`"version":"${"a".repeat(40)}"`),
    headers: { "cache-control": "no-store" },
  });
});
