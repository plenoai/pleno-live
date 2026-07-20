import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type Manifest = {
  package_id: string;
  edition: string;
  name: string;
  version: string;
  min_sdk_version: string;
  permissions: Array<{ name: string; whitelist?: string[] }>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

describe("Even G2 manifest", () => {
  const manifest = readJson<Manifest>("apps/even-g2/app.json");
  const rootPackage = readJson<{ version: string }>("package.json");

  it("tracks the product release version and current SDK contract", () => {
    expect(manifest.version).toBe(rootPackage.version);
    expect(manifest.edition).toBe("202601");
    expect(manifest.min_sdk_version).toBe("0.0.12");
  });

  it("uses a review-safe identity and only required permissions", () => {
    expect(manifest.package_id).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
    expect(manifest.name).not.toMatch(/even/i);
    expect(manifest.name.length).toBeLessThanOrEqual(20);
    expect(manifest.permissions.map(({ name }) => name).sort()).toEqual([
      "g2-microphone",
      "network",
    ]);
  });

  it("declares every production network origin", () => {
    const network = manifest.permissions.find(({ name }) => name === "network");
    expect(network?.whitelist).toEqual([
      "https://live.plenoai.com",
      "wss://api.elevenlabs.io",
    ]);
  });
});
