import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  BUILD_DIR,
  DEV_BINARY_PATH,
  compileDesktopBinary,
  resolveLocalBin,
  run,
} from "./desktop-common.mjs";

const DEV_SERVER_URL = "http://127.0.0.1:4173";

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

async function main() {
  await fs.mkdir(BUILD_DIR, { recursive: true });
  await run("node", ["scripts/build-schedule-data.mjs"]);
  await compileDesktopBinary(DEV_BINARY_PATH);

  const vite = spawn(resolveLocalBin("vite"), ["--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
    stdio: ["inherit", "pipe", "pipe"],
  });

  let desktop = null;
  let started = false;

  const shutdown = (code = 0) => {
    if (desktop && !desktop.killed) {
      desktop.kill("SIGTERM");
    }
    if (!vite.killed) {
      vite.kill("SIGTERM");
    }
    process.exit(code);
  };

  const maybeStartDesktop = () => {
    if (started) return;
    started = true;
    desktop = spawn(DEV_BINARY_PATH, [], {
      env: {
        ...process.env,
        BANDIHR_DEV_URL: DEV_SERVER_URL,
      },
      stdio: "inherit",
    });

    desktop.on("exit", (code) => {
      shutdown(code ?? 0);
    });
  };

  const onViteOutput = (chunk) => {
    const text = stripAnsi(String(chunk));
    process.stdout.write(chunk);
    if (text.includes(DEV_SERVER_URL)) {
      maybeStartDesktop();
    }
  };

  vite.stdout.on("data", onViteOutput);
  vite.stderr.on("data", (chunk) => process.stderr.write(chunk));
  vite.on("error", (error) => {
    console.error(error);
    shutdown(1);
  });
  vite.on("exit", (code) => {
    if (!started) {
      shutdown(code ?? 1);
    }
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
