import { describe, expect, it } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";

import {
  buildCreateDeviceBody,
  buildListDevicesUrl,
  createAppStoreConnectClient,
  createAuthToken,
  parseArgs,
  resolveCredentials,
  run,
} from "../scripts/register-ios-device.mjs";

function createTestKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    publicKey,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("createAuthToken", () => {
  it("builds an ES256 JWT with the expected header and claims", () => {
    const { publicKey, privateKeyPem } = createTestKey();
    const token = createAuthToken({
      keyId: "KEY123",
      issuerId: "ISSUER-1",
      privateKey: privateKeyPem,
      now: 1_000,
      expiresInSeconds: 1_200,
    });

    const [header, payload, signature] = token.split(".");
    expect(decodeSegment(header)).toEqual({
      alg: "ES256",
      kid: "KEY123",
      typ: "JWT",
    });
    expect(decodeSegment(payload)).toEqual({
      iss: "ISSUER-1",
      iat: 1_000,
      exp: 2_200,
      aud: "appstoreconnect-v1",
    });

    const verifier = createVerify("sha256");
    verifier.update(`${header}.${payload}`);
    verifier.end();
    expect(
      verifier.verify(
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });

  it("requires key id, issuer id and private key", () => {
    const { privateKeyPem } = createTestKey();
    expect(() =>
      createAuthToken({ issuerId: "I", privateKey: privateKeyPem }),
    ).toThrow(/key id/);
    expect(() =>
      createAuthToken({ keyId: "K", privateKey: privateKeyPem }),
    ).toThrow(/issuer id/);
    expect(() => createAuthToken({ keyId: "K", issuerId: "I" })).toThrow(
      /private key/,
    );
  });
});

describe("buildCreateDeviceBody", () => {
  it("matches the App Store Connect devices payload", () => {
    expect(buildCreateDeviceBody({ name: "Phone", udid: "ABC" })).toEqual({
      data: {
        type: "devices",
        attributes: { name: "Phone", udid: "ABC", platform: "IOS" },
      },
    });
  });

  it("rejects a missing name or udid", () => {
    expect(() => buildCreateDeviceBody({ udid: "ABC" })).toThrow(/name/);
    expect(() => buildCreateDeviceBody({ name: "Phone" })).toThrow(/udid/);
  });
});

describe("buildListDevicesUrl", () => {
  it("filters by platform and sets the page limit", () => {
    const url = new URL(buildListDevicesUrl());
    expect(url.origin).toBe("https://api.appstoreconnect.apple.com");
    expect(url.pathname).toBe("/v1/devices");
    expect(url.searchParams.get("filter[platform]")).toBe("IOS");
    expect(url.searchParams.get("limit")).toBe("200");
  });
});

describe("createAppStoreConnectClient", () => {
  it("lists devices across paginated responses", async () => {
    const { privateKeyPem } = createTestKey();
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url.includes("cursor=2")) {
        return jsonResponse(200, {
          data: [
            {
              id: "2",
              attributes: {
                name: "B",
                udid: "B1",
                platform: "IOS",
                status: "ENABLED",
              },
            },
          ],
          links: {},
        });
      }
      return jsonResponse(200, {
        data: [
          {
            id: "1",
            attributes: {
              name: "A",
              udid: "A1",
              platform: "IOS",
              status: "ENABLED",
            },
          },
        ],
        links: {
          next: "https://api.appstoreconnect.apple.com/v1/devices?cursor=2",
        },
      });
    };

    const client = createAppStoreConnectClient({
      keyId: "K",
      issuerId: "I",
      privateKey: privateKeyPem,
      fetchImpl,
      now: () => 1_234,
    });

    const devices = await client.listDevices();
    expect(devices.map((device) => device.udid)).toEqual(["A1", "B1"]);
    expect(calls).toHaveLength(2);
    expect(calls[0].init.headers.Authorization).toMatch(/^Bearer /);
  });

  it("registers a device with a POST body", async () => {
    const { privateKeyPem } = createTestKey();
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(201, {
        data: {
          id: "9",
          attributes: { name: "Phone", udid: "ABC", platform: "IOS" },
        },
      });
    };

    const client = createAppStoreConnectClient({
      keyId: "K",
      issuerId: "I",
      privateKey: privateKeyPem,
      fetchImpl,
    });
    const result = await client.registerDevice({
      name: "Phone",
      udid: "ABC",
    });

    expect(result.status).toBe("registered");
    expect(result.device.udid).toBe("ABC");
    expect(calls[0].url).toBe(
      "https://api.appstoreconnect.apple.com/v1/devices",
    );
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0].init.body)).toEqual({
      data: {
        type: "devices",
        attributes: { name: "Phone", udid: "ABC", platform: "IOS" },
      },
    });
  });

  it("treats a 409 conflict as already registered", async () => {
    const { privateKeyPem } = createTestKey();
    const client = createAppStoreConnectClient({
      keyId: "K",
      issuerId: "I",
      privateKey: privateKeyPem,
      fetchImpl: async () =>
        jsonResponse(409, { errors: [{ title: "already exists" }] }),
    });

    await expect(
      client.registerDevice({ name: "Phone", udid: "ABC" }),
    ).resolves.toMatchObject({ status: "exists" });
  });

  it("throws on an unexpected error response", async () => {
    const { privateKeyPem } = createTestKey();
    const client = createAppStoreConnectClient({
      keyId: "K",
      issuerId: "I",
      privateKey: privateKeyPem,
      fetchImpl: async () => jsonResponse(403, { errors: [] }),
    });

    await expect(
      client.registerDevice({ name: "Phone", udid: "ABC" }),
    ).rejects.toThrow(/403/);
  });

  it("requires a fetch implementation", () => {
    expect(() =>
      createAppStoreConnectClient({ keyId: "K", issuerId: "I", fetchImpl: null }),
    ).toThrow(/fetch/);
  });
});

describe("parseArgs", () => {
  it("parses the supported commands", () => {
    expect(parseArgs(["--list"]).command).toBe("list");
    expect(parseArgs(["--check"]).command).toBe("check");
    expect(parseArgs([]).command).toBe("help");
    expect(parseArgs(["--help"]).command).toBe("help");
  });

  it("infers register from --udid and captures values", () => {
    const options = parseArgs([
      "--register",
      "--udid",
      "UDID-1",
      "--name",
      "My iPhone",
      "--platform",
      "IOS",
    ]);
    expect(options).toMatchObject({
      command: "register",
      udid: "UDID-1",
      name: "My iPhone",
      platform: "IOS",
    });
    expect(parseArgs(["--udid", "UDID-1"]).command).toBe("register");
  });

  it("rejects unknown options", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown option/);
  });
});

describe("resolveCredentials", () => {
  it("falls back to the App Store Connect default key path", () => {
    const credentials = resolveCredentials({
      env: { ASC_KEY_ID: "K", ASC_ISSUER_ID: "I" },
      home: "/home/user",
      readFile: () => "PEM",
    });
    expect(credentials.keyPath).toBe(
      "/home/user/.appstoreconnect/private_keys/AuthKey_K.p8",
    );
    expect(credentials.privateKey).toBe("PEM");
  });

  it("prefers an explicit private key over reading a file", () => {
    const credentials = resolveCredentials({
      env: { ASC_KEY_ID: "K", ASC_PRIVATE_KEY: "INLINE" },
      home: "/home/user",
      readFile: () => {
        throw new Error("should not read");
      },
    });
    expect(credentials.privateKey).toBe("INLINE");
  });
});

describe("run --check", () => {
  function makeIo() {
    return {
      logs: [],
      errors: [],
      log(message) {
        this.logs.push(message);
      },
      error(message) {
        this.errors.push(message);
      },
    };
  }

  it("exits 1 and explains the failure when no devices are registered", async () => {
    const { privateKeyPem } = createTestKey();
    const io = makeIo();
    const code = await run(["--check"], {
      io,
      env: {
        ASC_KEY_ID: "K",
        ASC_ISSUER_ID: "I",
        ASC_PRIVATE_KEY: privateKeyPem,
      },
      fetchImpl: async () => jsonResponse(200, { data: [], links: {} }),
    });

    expect(code).toBe(1);
    expect(io.errors.join("\n")).toMatch(/登録デバイスが 0 台/);
  });

  it("exits 0 when at least one device is registered", async () => {
    const { privateKeyPem } = createTestKey();
    const io = makeIo();
    const code = await run(["--check"], {
      io,
      env: {
        ASC_KEY_ID: "K",
        ASC_ISSUER_ID: "I",
        ASC_PRIVATE_KEY: privateKeyPem,
      },
      fetchImpl: async () =>
        jsonResponse(200, {
          data: [
            {
              id: "1",
              attributes: { name: "A", udid: "A1", platform: "IOS" },
            },
          ],
          links: {},
        }),
    });

    expect(code).toBe(0);
    expect(io.logs.join("\n")).toMatch(/登録デバイス: 1 台/);
  });
});
