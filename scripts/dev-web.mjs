import { spawn } from "node:child_process";
import { buildScheduleData, startScheduleWatcher } from "./schedule-watch.mjs";
import { resolveLocalBin, ROOT_DIR } from "./desktop-common.mjs";

async function main() {
  await buildScheduleData();
  const watcher = startScheduleWatcher();

  const vite = spawn(resolveLocalBin("vite"), process.argv.slice(2), {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });

  const shutdown = (code = 0) => {
    watcher.close();
    if (!vite.killed) {
      vite.kill("SIGTERM");
    }
    process.exit(code);
  };

  vite.on("error", (error) => {
    console.error(error);
    shutdown(1);
  });

  vite.on("exit", (code) => {
    shutdown(code ?? 0);
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

