import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const gradle = fs.readFileSync(new URL("../android-tv/app/build.gradle.kts", import.meta.url), "utf8");

const androidVersion = gradle.match(/versionName\s*=\s*"([^"]+)"/)?.[1];
const rootLockVersion = lock.packages?.[""]?.version;

const expected = pkg.version;
const failures = [];
if (!expected) failures.push("package.json has no version");
if (lock.version !== expected) failures.push(`package-lock.json version ${lock.version} != ${expected}`);
if (rootLockVersion !== expected) failures.push(`package-lock root version ${rootLockVersion} != ${expected}`);
if (!androidVersion) failures.push("Android versionName not found");
else if (androidVersion !== expected) failures.push(`Android versionName ${androidVersion} != ${expected}`);

if (failures.length) {
  console.error("Version contract failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Version contract OK: ${expected}`);
