import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { syncOnce } from "./workbook-sync.mjs";

const configPath = path.join(os.homedir(), "Library", "Application Support", "BandiHR", "AutoPublish", "config.json");
if (process.argv.includes("--help")) {
  console.log("Install first: npm run publish:install. Use --once for a single check.");
} else {
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  do {
    try { await syncOnce(config); }
    catch (error) {
      console.error(error.message);
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (process.argv.includes("--once")) break;
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  } while (true);
}
