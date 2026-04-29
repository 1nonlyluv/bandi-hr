import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT_DIR } from "./desktop-common.mjs";

const LABEL = "com.bandi.hr.autopublish";
const WATCH_SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "watch-workbook-publish.mjs");
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), "Library", "LaunchAgents");
const LOG_DIR = path.join(os.homedir(), "Library", "Logs");
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${LABEL}.plist`);
const LOG_PATH = path.join(LOG_DIR, "bandi-hr-autopublish.log");
const DOMAIN_TARGET = `gui/${process.getuid()}`;
const SERVICE_TARGET = `${DOMAIN_TARGET}/${LABEL}`;

function plistXml() {
  const nodePath = process.execPath;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${WATCH_SCRIPT_PATH}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${ROOT_DIR}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>

  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>
</dict>
</plist>
`;
}

function run(command, args, options = {}) {
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

async function printStatus() {
  try {
    await run("launchctl", ["print", SERVICE_TARGET]);
  } catch {
    console.log(`Service ${LABEL} is not loaded.`);
  }
}

async function install() {
  await fs.mkdir(LAUNCH_AGENTS_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.writeFile(PLIST_PATH, plistXml(), "utf8");

  await run("launchctl", ["bootout", SERVICE_TARGET]).catch(() => {});
  await run("launchctl", ["bootstrap", DOMAIN_TARGET, PLIST_PATH]);
  await run("launchctl", ["enable", SERVICE_TARGET]).catch(() => {});
  await run("launchctl", ["kickstart", "-k", SERVICE_TARGET]);

  console.log(`Installed ${LABEL}`);
  console.log(`plist: ${PLIST_PATH}`);
  console.log(`log: ${LOG_PATH}`);
}

async function uninstall() {
  await run("launchctl", ["bootout", SERVICE_TARGET]).catch(() => {});
  await fs.rm(PLIST_PATH, { force: true });
  console.log(`Removed ${LABEL}`);
}

async function main() {
  const mode = process.argv[2] ?? "install";

  if (mode === "--help" || mode === "-h") {
    console.log("Usage:");
    console.log("  bun run publish:install");
    console.log("  bun run publish:uninstall");
    console.log("  bun run publish:status");
    return;
  }

  if (mode === "install") {
    await install();
    return;
  }

  if (mode === "uninstall") {
    await uninstall();
    return;
  }

  if (mode === "status") {
    await printStatus();
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
