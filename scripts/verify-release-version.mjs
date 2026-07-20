import { readFileSync } from "node:fs";

const releaseTag = process.argv[2];
if (!releaseTag) {
  throw new Error("Release tag is required");
}

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const evenManifest = JSON.parse(readFileSync("apps/even-g2/app.json", "utf8"));
const expectedTag = `v${rootPackage.version}`;

if (releaseTag !== expectedTag) {
  throw new Error(`Release tag ${releaseTag} does not match ${expectedTag}`);
}
if (evenManifest.version !== rootPackage.version) {
  throw new Error(
    `Even G2 version ${evenManifest.version} does not match ${rootPackage.version}`,
  );
}

console.log(`Release versions match ${releaseTag}`);
