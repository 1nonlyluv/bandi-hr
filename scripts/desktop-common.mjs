import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
export const DESKTOP_DIR = path.join(ROOT_DIR, "desktop");
export const BUILD_DIR = path.join(DESKTOP_DIR, "build");
export const DIST_DIR = path.join(ROOT_DIR, "dist");
export const MAC_DIR = path.join(DESKTOP_DIR, "mac");
export const APP_NAME = "BandiHR";
export const APP_BUNDLE_PATH = path.join(BUILD_DIR, `${APP_NAME}.app`);
export const DEV_BINARY_PATH = path.join(BUILD_DIR, `${APP_NAME}-dev`);
export const DESKTOP_SOURCE_PATH = path.join(MAC_DIR, `${APP_NAME}.m`);
export const INFO_PLIST_PATH = path.join(MAC_DIR, "Info.plist");

export function resolveLocalBin(name) {
  const executable = process.platform === "win32" ? `${name}.cmd` : name;
  return path.join(ROOT_DIR, "node_modules", ".bin", executable);
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`${command} exited with signal ${signal}`));
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

export async function buildRenderer() {
  await run("node", ["scripts/build-schedule-data.mjs"]);
  await run(resolveLocalBin("tsc"), ["-b"]);
  await run(resolveLocalBin("vite"), ["build"]);
}

export async function compileDesktopBinary(outputPath) {
  await run("clang", [
    "-fobjc-arc",
    `-fmodules-cache-path=${path.join(BUILD_DIR, "module-cache")}`,
    "-framework",
    "Cocoa",
    "-framework",
    "WebKit",
    DESKTOP_SOURCE_PATH,
    "-o",
    outputPath,
  ]);
}
