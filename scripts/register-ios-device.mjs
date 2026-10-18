#!/usr/bin/env node
// App Store Connect API で iOS の登録デバイスを一覧・登録する CLI。
//
// 背景: Xcode Cloud の Archive Action は app-store エクスポートに加えて
// ad-hoc / development エクスポートも実行する。Apple は development / ad-hoc
// プロビジョニングプロファイルの作成に登録デバイスを要求するため、チームの
// 登録デバイスが 0 台だと `xcodebuild -exportArchive` が exit 70 で失敗し、
// Archive Action 全体が失敗扱いになって TestFlight にビルドが届かない。
// Xcode Cloud には ad-hoc / development エクスポートを無効化する設定が無いため、
// 少なくとも 1 台デバイスを登録しておく必要がある。
//
// 必要な環境変数 (App Store Connect API キー):
//   ASC_KEY_ID            API キー ID
//   ASC_ISSUER_ID         Issuer ID
//   ASC_PRIVATE_KEY       .p8 の中身 (PEM) または
//   ASC_PRIVATE_KEY_PATH  .p8 のパス
//                         既定: ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
//
// 使い方:
//   node scripts/register-ios-device.mjs --list
//   node scripts/register-ios-device.mjs --register --udid <UDID> --name "My iPhone"
//   node scripts/register-ios-device.mjs --check   # 0 台なら exit 1
import { createPrivateKey, createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const ASC_API_BASE_URL = "https://api.appstoreconnect.apple.com";
export const DEFAULT_DEVICE_PLATFORM = "IOS";

function encodeSegment(value) {
  return Buffer.from(value).toString("base64url");
}

// App Store Connect API 用の ES256 (ECDSA P-256) JWT を生成する。
// jose 等を追加せず Node 標準の crypto だけで完結させ、Xcode Cloud の
// フックからも依存なしで呼べるようにしている。
export function createAuthToken({
  keyId,
  issuerId,
  privateKey,
  now = Math.floor(Date.now() / 1000),
  expiresInSeconds = 1200,
  audience = "appstoreconnect-v1",
} = {}) {
  if (!keyId) throw new Error("ASC key id is required");
  if (!issuerId) throw new Error("ASC issuer id is required");
  if (!privateKey) throw new Error("ASC private key is required");

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + expiresInSeconds,
    aud: audience,
  };
  const signingInput = `${encodeSegment(JSON.stringify(header))}.${encodeSegment(JSON.stringify(payload))}`;

  const signer = createSign("sha256");
  signer.update(signingInput);
  signer.end();
  // JWT (JWS) は DER ではなく IEEE P1363 の生 R||S 署名を要求する。
  const signature = signer.sign({
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${signature.toString("base64url")}`;
}

export function buildCreateDeviceBody({ name, udid, platform = DEFAULT_DEVICE_PLATFORM } = {}) {
  if (!name) throw new Error("device name is required");
  if (!udid) throw new Error("device udid is required");
  return {
    data: {
      type: "devices",
      attributes: { name, udid, platform },
    },
  };
}

export function buildListDevicesUrl(
  baseUrl = ASC_API_BASE_URL,
  { platform = DEFAULT_DEVICE_PLATFORM, limit = 200 } = {},
) {
  const url = new URL("/v1/devices", baseUrl);
  url.searchParams.set("filter[platform]", platform);
  url.searchParams.set("limit", String(limit));
  return url.toString();
}

function normalizeDevice(resource) {
  return {
    id: resource?.id ?? null,
    name: resource?.attributes?.name ?? null,
    udid: resource?.attributes?.udid ?? null,
    platform: resource?.attributes?.platform ?? null,
    status: resource?.attributes?.status ?? null,
    deviceClass: resource?.attributes?.deviceClass ?? null,
  };
}

export function createAppStoreConnectClient({
  keyId,
  issuerId,
  privateKey,
  baseUrl = ASC_API_BASE_URL,
  fetchImpl = globalThis.fetch,
  now = () => Math.floor(Date.now() / 1000),
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("a fetch implementation is required");
  }

  function authHeader() {
    return `Bearer ${createAuthToken({ keyId, issuerId, privateKey, now: now() })}`;
  }

  async function parseBody(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async function listDevices({ platform = DEFAULT_DEVICE_PLATFORM } = {}) {
    const devices = [];
    let url = buildListDevicesUrl(baseUrl, { platform });
    while (url) {
      const response = await fetchImpl(url, {
        headers: { Authorization: authHeader() },
      });
      const body = await parseBody(response);
      if (!response.ok) {
        throw new Error(
          `Failed to list devices (${response.status}): ${JSON.stringify(body)}`,
        );
      }
      for (const resource of body?.data ?? []) {
        devices.push(normalizeDevice(resource));
      }
      url = body?.links?.next ?? null;
    }
    return devices;
  }

  async function registerDevice({
    name,
    udid,
    platform = DEFAULT_DEVICE_PLATFORM,
  } = {}) {
    const response = await fetchImpl(new URL("/v1/devices", baseUrl).toString(), {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildCreateDeviceBody({ name, udid, platform })),
    });
    const body = await parseBody(response);

    // 既に登録済みの UDID を再送すると 409 Conflict が返る。再実行を
    // 冪等にするため失敗ではなく "exists" として扱う。
    if (response.status === 409) {
      return { status: "exists", device: null, body };
    }
    if (!response.ok) {
      throw new Error(
        `Failed to register device (${response.status}): ${JSON.stringify(body)}`,
      );
    }
    return { status: "registered", device: normalizeDevice(body?.data), body };
  }

  return { authHeader, listDevices, registerDevice };
}

export function parseArgs(argv = []) {
  const options = { command: "help", platform: DEFAULT_DEVICE_PLATFORM };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--list":
        options.command = "list";
        break;
      case "--check":
        options.command = "check";
        break;
      case "--register":
        if (options.command === "help") options.command = "register";
        break;
      case "--help":
      case "-h":
        options.command = "help";
        break;
      case "--udid":
        options.udid = argv[(i += 1)];
        if (options.command === "help") options.command = "register";
        break;
      case "--name":
        options.name = argv[(i += 1)];
        break;
      case "--platform":
        options.platform = argv[(i += 1)];
        break;
      case "--key-id":
        options.keyId = argv[(i += 1)];
        break;
      case "--issuer-id":
        options.issuerId = argv[(i += 1)];
        break;
      case "--private-key-path":
        options.privateKeyPath = argv[(i += 1)];
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export function resolveCredentials({
  env = process.env,
  home = homedir(),
  readFile = readFileSync,
} = {}) {
  const keyId = env.ASC_KEY_ID || undefined;
  const issuerId = env.ASC_ISSUER_ID || undefined;
  let privateKey = env.ASC_PRIVATE_KEY || undefined;
  const keyPath =
    env.ASC_PRIVATE_KEY_PATH ||
    (keyId
      ? join(home, ".appstoreconnect", "private_keys", `AuthKey_${keyId}.p8`)
      : undefined);

  if (!privateKey && keyPath) {
    try {
      privateKey = readFile(keyPath, "utf8");
    } catch {
      // キーが無い場合はここではエラーにせず、資格情報チェック側で通知する。
    }
  }

  return { keyId, issuerId, privateKey, keyPath };
}

export function helpText() {
  return `App Store Connect の登録デバイスを管理する (Xcode Cloud の ad-hoc/development エクスポートに必須)

Usage:
  node scripts/register-ios-device.mjs --list
  node scripts/register-ios-device.mjs --register --udid <UDID> --name "<NAME>" [--platform IOS]
  node scripts/register-ios-device.mjs --check

Options:
  --list                    登録デバイスを一覧表示
  --register                デバイスを登録 (--udid と --name が必要)
  --check                   登録デバイスが 0 台なら exit 1 (CI 事前確認用)
  --udid <UDID>             登録する端末の UDID
  --name <NAME>             表示名 (例: "Hikaru's iPhone")
  --platform <PLATFORM>     既定: IOS
  --key-id <ID>             ASC_KEY_ID を上書き
  --issuer-id <ID>          ASC_ISSUER_ID を上書き
  --private-key-path <PATH> ASC_PRIVATE_KEY_PATH を上書き

Environment:
  ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (PEM) / ASC_PRIVATE_KEY_PATH`;
}

function missingCredentialsMessage({ keyPath } = {}) {
  return [
    "App Store Connect API の認証情報がありません。",
    "ASC_KEY_ID / ASC_ISSUER_ID と、ASC_PRIVATE_KEY (PEM) または ASC_PRIVATE_KEY_PATH を設定してください。",
    keyPath ? `既定のキーパス: ${keyPath}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function run(
  argv = [],
  {
    io = console,
    env = process.env,
    home = homedir(),
    readFile = readFileSync,
    fetchImpl = globalThis.fetch,
    now,
  } = {},
) {
  const options = parseArgs(argv);

  if (options.command === "help") {
    io.log(helpText());
    return 0;
  }

  const credentials = resolveCredentials({ env, home, readFile });
  const keyId = options.keyId ?? credentials.keyId;
  const issuerId = options.issuerId ?? credentials.issuerId;
  const privateKeyPath = options.privateKeyPath ?? credentials.keyPath;
  let privateKey = credentials.privateKey;
  if (!privateKey && options.privateKeyPath) {
    privateKey = readFile(options.privateKeyPath, "utf8");
  }

  if (!keyId || !issuerId || !privateKey) {
    throw new Error(missingCredentialsMessage({ keyPath: privateKeyPath }));
  }

  const client = createAppStoreConnectClient({
    keyId,
    issuerId,
    privateKey,
    fetchImpl,
    ...(now ? { now } : {}),
  });

  if (options.command === "list" || options.command === "check") {
    const devices = await client.listDevices({ platform: options.platform });
    if (devices.length === 0) {
      if (options.command === "check") {
        io.error(
          "✗ 登録デバイスが 0 台です。Xcode Cloud の ad-hoc/development エクスポートが exit 70 で失敗します。",
        );
        io.error(
          "  --register --udid <UDID> --name \"<NAME>\" で 1 台以上登録してください。",
        );
        return 1;
      }
      io.log("登録デバイスは 0 台です。");
      return 0;
    }
    io.log(`登録デバイス: ${devices.length} 台`);
    for (const device of devices) {
      io.log(
        `  - ${device.name ?? "(no name)"} [${device.platform ?? "?"}] ${device.udid ?? ""} (${device.status ?? "?"})`,
      );
    }
    return 0;
  }

  if (!options.udid || !options.name) {
    throw new Error("--register には --udid と --name が必要です。");
  }

  const result = await client.registerDevice({
    name: options.name,
    udid: options.udid,
    platform: options.platform,
  });
  if (result.status === "exists") {
    io.log(`既に登録済みです: ${options.udid}`);
  } else {
    io.log(`登録しました: ${result.device?.name ?? options.name} ${options.udid}`);
  }
  return 0;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`✗ ${error.message}`);
      process.exitCode = 1;
    });
}
