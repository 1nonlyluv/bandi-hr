import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/build-schedule-data.mjs"], {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`build-schedule-data exited with signal ${signal}`));
        return;
      }

      reject(new Error(`build-schedule-data exited with code ${code ?? "unknown"}`));
    });
  });
}

function shouldRebuild(filename) {
  if (!filename) return false;
  return filename.endsWith(".xlsx") || filename === ".env" || filename === ".env.local";
}

export async function buildScheduleData() {
  await runBuild();
}

export function startScheduleWatcher() {
  let timer = null;
  let running = false;
  let pending = false;

  const trigger = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void rebuild();
    }, 250);
  };

  const rebuild = async () => {
    if (running) {
      pending = true;
      return;
    }

    running = true;
    try {
      await runBuild();
    } catch (error) {
      console.error(error);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        trigger();
      }
    }
  };

  const watcher = fs.watch(ROOT_DIR, (_eventType, filename) => {
    if (shouldRebuild(filename)) {
      trigger();
    }
  });

  return {
    close() {
      if (timer) {
        clearTimeout(timer);
      }
      watcher.close();
    },
  };
}

