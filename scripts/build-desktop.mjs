import fs from "node:fs/promises";
import path from "node:path";
import {
  APP_BUNDLE_PATH,
  APP_NAME,
  BUILD_DIR,
  DIST_DIR,
  INFO_PLIST_PATH,
  buildRenderer,
  compileDesktopBinary,
} from "./desktop-common.mjs";

async function main() {
  await buildRenderer();

  const contentsDir = path.join(APP_BUNDLE_PATH, "Contents");
  const macOsDir = path.join(contentsDir, "MacOS");
  const resourcesDir = path.join(contentsDir, "Resources");
  const webDir = path.join(resourcesDir, "web");
  const binaryPath = path.join(macOsDir, APP_NAME);

  await fs.mkdir(BUILD_DIR, { recursive: true });
  await fs.rm(APP_BUNDLE_PATH, { recursive: true, force: true });
  await fs.mkdir(macOsDir, { recursive: true });
  await fs.mkdir(resourcesDir, { recursive: true });

  await compileDesktopBinary(binaryPath);
  await fs.copyFile(INFO_PLIST_PATH, path.join(contentsDir, "Info.plist"));
  await fs.cp(DIST_DIR, webDir, { recursive: true });

  console.log(`Desktop app created at ${APP_BUNDLE_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
