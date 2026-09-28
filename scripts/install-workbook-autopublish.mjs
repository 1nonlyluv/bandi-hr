import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(os.homedir(), "Library", "Application Support", "BandiHR", "AutoPublish");
const label = "com.bandi.hr.autopublish";
const domain = `gui/${process.getuid()}`;
const plist = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const log = path.join(runtime, "sync.log");
const xml = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const run = (...args) => execFileSync("/bin/launchctl", args, { cwd: os.homedir(), stdio: "inherit" });
const mode = process.argv[2] ?? "install";

if (mode === "status") {
  try { run("print", `${domain}/${label}`); } catch {}
  try { console.log(await fs.readFile(path.join(runtime, "status.json"), "utf8")); }
  catch { console.log("No sync status recorded yet."); }
  console.log(`Log: ${log}`);
} else if (mode === "uninstall") {
  try { run("bootout", `${domain}/${label}`); } catch {}
  await fs.rm(plist, { force: true });
} else if (mode === "install") {
  const source = path.resolve(process.argv[3] ?? path.join(root, "26년 근무표.xlsx"));
  await fs.access(source);
  await fs.mkdir(runtime, { recursive: true });
  await fs.mkdir(path.dirname(plist), { recursive: true });
  try { run("bootout", `${domain}/${label}`); } catch {}
  await fs.copyFile(path.join(root, "scripts", "workbook-sync.mjs"), path.join(runtime, "workbook-sync.mjs"));
  await fs.writeFile(path.join(runtime, "config.json"), JSON.stringify({
    runtime, source, workbookName: "26년 근무표.xlsx",
    remote: "https://github.com/1nonlyluv/bandi-hr.git",
    site: "https://1nonlyluv.github.io/bandi-hr/", notify: true,
  }, null, 2) + "\n", { mode: 0o600 });
  await fs.writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>
<string>${xml(process.execPath)}</string>
<string>${xml(path.join(runtime, "workbook-sync.mjs"))}</string>
<string>${xml(path.join(runtime, "config.json"))}</string>
</array>
<key>WorkingDirectory</key><string>${xml(runtime)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin</string></dict>
<key>RunAtLoad</key><true/>
<key>StartInterval</key><integer>60</integer>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(log)}</string>
<key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>\n`);
  run("enable", `${domain}/${label}`);
  run("bootstrap", domain, plist);
  console.log(`Installed. Workbook: ${source}\nRuntime: ${runtime}\nLog: ${log}`);
} else {
  throw new Error("Usage: node scripts/install-workbook-autopublish.mjs install [workbook-path] | status | uninstall");
}
