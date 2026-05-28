import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT_DIR } from "./desktop-common.mjs";

const WORKBOOK_NAME = "26년 근무표.xlsx";
const GENERATED_JSON_PATH = "src/data/generated/schedule.json";
const WATCHED_PATHS = [WORKBOOK_NAME, GENERATED_JSON_PATH];

function timestampLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  const hour = `${now.getHours()}`.padStart(2, "0");
  const minute = `${now.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT_DIR,
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

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      if (signal) {
        reject(new Error(`${command} exited with signal ${signal}`));
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function getCurrentBranch() {
  return runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
}

async function getWatchedChanges() {
  const output = await runCapture("git", ["status", "--short", "--", ...WATCHED_PATHS]);
  return output ? output.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

async function createPublishWorktree() {
  const tempDir = path.join(os.tmpdir(), `bandihr-autopublish-${process.pid}-${Date.now()}`);
  await run("git", ["fetch", "origin", "main"]);
  await run("git", ["worktree", "add", "--detach", tempDir, "origin/main"]);
  return tempDir;
}

async function removePublishWorktree(tempDir) {
  await run("git", ["worktree", "remove", "--force", tempDir]).catch((error) => {
    console.warn(`[auto-publish] Failed to remove temp worktree ${tempDir}`);
    console.warn(error instanceof Error ? error.message : error);
  });
  await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
}

async function copyWatchedFiles(targetDir) {
  for (const relativePath of WATCHED_PATHS) {
    const sourcePath = path.join(ROOT_DIR, relativePath);
    const targetPath = path.join(targetDir, relativePath);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.copyFile(sourcePath, targetPath);
  }
}

async function getWorktreeWatchedChanges(targetDir) {
  const output = await runCapture("git", ["status", "--short", "--", ...WATCHED_PATHS], { cwd: targetDir });
  return output ? output.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

async function publishWorkbookUpdate() {
  const branch = await getCurrentBranch();
  if (branch !== "main") {
    throw new Error(`Auto publish is only allowed on main. Current branch: ${branch}`);
  }

  await run(process.execPath, ["scripts/build-schedule-data.mjs"]);

  const watchedChanges = await getWatchedChanges();
  if (!watchedChanges.length) {
    console.log("[auto-publish] No workbook-related changes to publish.");
    return;
  }

  const publishDir = await createPublishWorktree();

  try {
    await copyWatchedFiles(publishDir);

    const worktreeChanges = await getWorktreeWatchedChanges(publishDir);
    if (!worktreeChanges.length) {
      console.log("[auto-publish] No remote-facing workbook changes to publish.");
      return;
    }

    await run("git", ["add", "--", ...WATCHED_PATHS], { cwd: publishDir });
    await run("git", ["commit", "-m", `Auto update workbook ${timestampLabel()}`], { cwd: publishDir });
    await run("git", ["push", "origin", "HEAD:main"], { cwd: publishDir });
  } finally {
    await removePublishWorktree(publishDir);
  }
}

async function main() {
  const workbookPath = path.join(ROOT_DIR, WORKBOOK_NAME);
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Usage: bun run publish:watch");
    console.log("Watches 26년 근무표.xlsx and auto-publishes workbook changes to origin/main.");
    return;
  }

  console.log(`[auto-publish] Watching ${workbookPath}`);
  console.log("[auto-publish] On save: rebuild schedule, commit workbook + generated JSON, push main.");

  let timer = null;
  let running = false;
  let pending = false;

  const trigger = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void publish();
    }, 1200);
  };

  const publish = async () => {
    if (running) {
      pending = true;
      return;
    }

    running = true;
    try {
      await publishWorkbookUpdate();
      console.log("[auto-publish] Publish completed.");
    } catch (error) {
      console.error("[auto-publish] Publish failed.");
      console.error(error instanceof Error ? error.message : error);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        trigger();
      }
    }
  };

  fs.watchFile(workbookPath, { interval: 1500 }, (current, previous) => {
    if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) {
      trigger();
    }
  });

  const shutdown = () => {
    if (timer) {
      clearTimeout(timer);
    }
    fs.unwatchFile(workbookPath);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
