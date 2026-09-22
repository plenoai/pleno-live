import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RealtimeTokenRateLimiter,
  issueRealtimeToken,
} from "../apps/server/realtime-token";

type LambdaResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

function apiGatewayEvent({
  method = "POST",
  path = "/api/even-g2/realtime-token",
  origin = "null",
  sourceIp = "198.51.100.1",
  body = "",
  headers = {},
}: {
  method?: string;
  path?: string;
  origin?: string;
  sourceIp?: string;
  body?: string;
  headers?: Record<string, string>;
}) {
  return {
    version: "2.0",
    rawPath: path,
    rawQueryString: "",
    headers: { origin, ...headers },
    requestContext: {
      requestId: "request-id",
      http: { method, sourceIp },
    },
    body,
    isBase64Encoded: false,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("RealtimeTokenRateLimiter", () => {
  it("limits each client to five token requests per minute", () => {
    const limiter = new RealtimeTokenRateLimiter();

    for (let request = 0; request < 5; request += 1) {
      expect(limiter.consume("client", 0)).toBe(true);
    }
    expect(limiter.consume("client", 0)).toBe(false);
    expect(limiter.consume("client", 60_000)).toBe(true);
  });

  it("caps token issuance across clients within one process", () => {
    const limiter = new RealtimeTokenRateLimiter();

    for (let request = 0; request < 100; request += 1) {
      expect(limiter.consume(`client-${request}`, 0)).toBe(true);
    }
    expect(limiter.consume("client-100", 0)).toBe(false);
    expect(limiter.consume("client-100", 60_000)).toBe(true);
  });
});

describe("issueRealtimeToken", () => {
  it("returns a server-generated single-use token", async () => {
    const tokenFactory = vi.fn().mockResolvedValue("single-use");

    await expect(
      issueRealtimeToken(
        "client",
        new RealtimeTokenRateLimiter(),
        tokenFactory,
      ),
    ).resolves.toEqual({ ok: true, token: "single-use" });
    expect(tokenFactory).toHaveBeenCalledOnce();
  });

  it("does not call the provider after the request limit", async () => {
    const limiter = new RealtimeTokenRateLimiter();
    const tokenFactory = vi.fn().mockResolvedValue("single-use");

    for (let request = 0; request < 5; request += 1) {
      await issueRealtimeToken("client", limiter, tokenFactory);
    }

    await expect(
      issueRealtimeToken("client", limiter, tokenFactory),
    ).resolves.toEqual({
      ok: false,
      status: 429,
      error: "Too many token requests",
      retryAfterSeconds: 60,
    });
    expect(tokenFactory).toHaveBeenCalledTimes(5);
  });

  it("does not expose provider errors", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const tokenFactory = vi
      .fn()
      .mockRejectedValue(new Error("secret provider response"));

    await expect(
      issueRealtimeToken(
        "client",
        new RealtimeTokenRateLimiter(),
        tokenFactory,
      ),
    ).resolves.toEqual({
      ok: false,
      status: 502,
      error: "Transcription service unavailable",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[Realtime] Token request failed",
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "secret provider response",
    );
  });

  it("rejects malformed provider tokens", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      issueRealtimeToken(
        "client",
        new RealtimeTokenRateLimiter(),
        vi.fn().mockResolvedValue(""),
      ),
    ).resolves.toEqual({
      ok: false,
      status: 502,
      error: "Transcription service unavailable",
    });
  });
});

describe("Even G2 token HTTP boundary", () => {
  it("uses credentialless wildcard CORS and disables token caching", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "test");
    vi.stubEnv("ALLOWED_ORIGINS", "https://allowed.example");
    vi.stubEnv("ELEVENLABS_API_KEY", "provider-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: "single-use" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.resetModules();

    const { handler } = await import("../apps/server/_core/index");
    const response = (await handler(apiGatewayEvent({}), {})) as LambdaResponse;

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(
      response.headers["access-control-allow-credentials"],
    ).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store, max-age=0");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers.expires).toBe("0");
    expect(JSON.parse(response.body)).toEqual({ token: "single-use" });
  });

  it("answers token preflights without credentialed or broad method access", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "test");
    vi.resetModules();

    const { handler } = await import("../apps/server/_core/index");
    const response = (await handler(
      apiGatewayEvent({ method: "OPTIONS", origin: "file://" }),
      {},
    )) as LambdaResponse;

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-methods"]).toBe(
      "POST, OPTIONS",
    );
    expect(
      response.headers["access-control-allow-credentials"],
    ).toBeUndefined();
  });

  it("preserves the origin allowlist on other routes", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "test");
    vi.stubEnv("ALLOWED_ORIGINS", "https://allowed.example");
    vi.resetModules();

    const { handler } = await import("../apps/server/_core/index");
    const allowed = (await handler(
      apiGatewayEvent({
        method: "GET",
        path: "/api/health",
        origin: "https://allowed.example",
      }),
      {},
    )) as LambdaResponse;
    const denied = (await handler(
      apiGatewayEvent({
        method: "GET",
        path: "/api/health",
        origin: "https://attacker.example",
      }),
      {},
    )) as LambdaResponse;

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://allowed.example",
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    expect(denied.headers.vary).toContain("Origin");
  });

  it("rejects request bodies before provider invocation", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "test");
    vi.stubEnv("ELEVENLABS_API_KEY", "provider-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { handler } = await import("../apps/server/_core/index");
    const response = (await handler(
      apiGatewayEvent({
        sourceIp: "198.51.100.2",
        body: "{}",
        headers: {
          "content-length": "0",
          "content-type": "application/json",
        },
      }),
      {},
    )) as LambdaResponse;

    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body)).toEqual({
      error: "Request body not allowed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate-limits by the API Gateway source IP, not spoofable headers", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "test");
    vi.stubEnv("ELEVENLABS_API_KEY", "provider-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "single-use" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { handler } = await import("../apps/server/_core/index");
    let response: LambdaResponse | undefined;
    for (let request = 0; request < 6; request += 1) {
      response = (await handler(
        apiGatewayEvent({
          sourceIp: "198.51.100.3",
          headers: { "x-forwarded-for": `203.0.113.${request}` },
        }),
        {},
      )) as LambdaResponse;
    }

    expect(response?.statusCode).toBe(429);
    expect(response?.headers["retry-after"]).toBe("60");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe("OpenAI realtime token HTTP boundary", () => {
  it("issues an ephemeral client secret for a transcription session", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "test");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: "ek_secret", expires_at: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { handler } = await import("../apps/server/_core/index");
    const response = (await handler(
      apiGatewayEvent({ path: "/api/openai/realtime-token" }),
      {},
    )) as LambdaResponse;

    expect(response.statusCode).toBe(200);
    // クライアントには API キーではなく短命のシークレットだけを返す
    expect(JSON.parse(response.body)).toEqual({ token: "ek_secret" });
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["cache-control"]).toBe("no-store, max-age=0");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(init.headers.Authorization).toBe("Bearer openai-key");
    const body = JSON.parse(init.body);
    expect(body.session.type).toBe("transcription");
    expect(body.session.audio.input.transcription.model).toBe(
      "gpt-live-transcribe",
    );
    expect(body.session.audio.input.format).toEqual({
      type: "audio/pcm",
      rate: 24000,
    });
  });

  it("hides provider failures behind a 502", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "test");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("nope", { status: 401, statusText: "Unauthorized" }),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.resetModules();

    const { handler } = await import("../apps/server/_core/index");
    const response = (await handler(
      apiGatewayEvent({
        path: "/api/openai/realtime-token",
        sourceIp: "198.51.100.9",
      }),
      {},
    )) as LambdaResponse;

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({
      error: "Transcription service unavailable",
    });
    expect(response.body).not.toContain("openai-key");
  });

  it("rejects request bodies on the OpenAI route too", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "test");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { handler } = await import("../apps/server/_core/index");
    const response = (await handler(
      apiGatewayEvent({
        path: "/api/openai/realtime-token",
        sourceIp: "198.51.100.10",
        body: "{}",
        headers: { "content-length": "0", "content-type": "application/json" },
      }),
      {},
    )) as LambdaResponse;

    expect(response.statusCode).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
