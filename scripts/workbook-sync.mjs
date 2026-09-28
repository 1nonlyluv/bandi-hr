import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString();

async function readState(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

async function writeState(file, state) {
  await fs.writeFile(`${file}.tmp`, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  await fs.rename(`${file}.tmp`, file);
}

async function command(program, args, cwd) {
  const { stdout } = await exec(program, args, {
    cwd, timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

async function checkDeployment(config, state) {
  const response = await fetch(`https://api.github.com/repos/1nonlyluv/bandi-hr/actions/runs?head_sha=${state.commit}&per_page=10`, {
    headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Deployment status HTTP ${response.status}`);
  const run = (await response.json()).workflow_runs.find((item) => item.path === ".github/workflows/deploy-bandihr-webapp.yml");
  if (!run || run.status !== "completed") {
    if (Date.now() - Date.parse(state.pushedAt) > 20 * 60_000) throw new Error("Deployment has not completed within 20 minutes. Check GitHub Actions.");
    state.status = "deploying";
    return;
  }
  if (run.conclusion !== "success") throw new Error(`Deployment ${run.conclusion}: ${run.html_url}`);
  const live = await fetch(`${config.site}version.json?check=${Date.now()}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!live.ok) throw new Error(`Live version HTTP ${live.status}`);
  const version = await live.json();
  if (version.workbookSha256 !== state.publishedHash) throw new Error("Published website still has a different workbook; retrying verification.");
  state.status = "current";
  state.deployedHash = state.publishedHash;
  state.deployedAt = now();
}

// Each attempt uses a disposable checkout, never the user's working repository.
export async function syncOnce(config) {
  await fs.mkdir(config.runtime, { recursive: true });
  const lock = path.join(config.runtime, "lock");
  try { await fs.mkdir(lock); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (Date.now() - (await fs.stat(lock)).mtimeMs < 10 * 60_000) return { status: "busy" };
    await fs.rm(lock, { recursive: true });
    await fs.mkdir(lock);
  }
  const stateFile = path.join(config.runtime, "status.json");
  let state = {};
  let job;
  try {
    state = await readState(stateFile);
    state.checkedAt = now();
    const first = await fs.readFile(config.source);
    if (first.length === 0) throw new Error("Workbook is empty; waiting for the next saved copy.");
    const firstHash = hash(first);
    await wait(config.settleMs ?? 2000);
    const bytes = await fs.readFile(config.source);
    if (hash(bytes) !== firstHash) throw new Error("Workbook is still being saved; retrying next minute.");
    state.sourceHash = firstHash;
    if (state.publishedHash !== firstHash) {
      job = await fs.mkdtemp(path.join(config.runtime, "job-"));
      const snapshot = path.join(job, "snapshot.xlsx");
      await fs.writeFile(snapshot, bytes);
      await command("/usr/bin/unzip", ["-tqq", snapshot], job);
      const workbookXml = await command("/usr/bin/unzip", ["-p", snapshot, "xl/workbook.xml"], job);
      if (!/\d{2}년\s*\d{1,2}월/.test(workbookXml)) throw new Error("No monthly schedule sheets found in workbook.");
      const repo = path.join(job, "repo");
      await command("git", ["clone", "--quiet", "--depth", "1", "--branch", "main", config.remote, repo], job);
      const target = path.join(repo, config.workbookName);
      const remoteBytes = await fs.readFile(target).catch((error) => { if (error.code === "ENOENT") return Buffer.alloc(0); throw error; });
      if (hash(remoteBytes) !== firstHash) {
        await fs.copyFile(snapshot, target);
        await command("git", ["add", "--", config.workbookName], repo);
        await command("git", ["-c", "user.name=Bandi HR Auto Update", "-c", "user.email=bandi-hr-autoupdate@users.noreply.github.com", "commit", "-m", `Auto update workbook ${now()}`], repo);
        await command("git", ["push", "origin", "HEAD:main"], repo);
      } else {
        await command("git", ["push", "--dry-run", "origin", "HEAD:main"], repo);
      }
      state.commit = await command("git", ["rev-parse", "HEAD"], repo);
      state.publishedHash = firstHash;
      state.pushedAt = now();
      state.status = "deploying";
      await writeState(stateFile, state);
    }
    if (config.monitorDeployment !== false && state.deployedHash !== state.publishedHash) await checkDeployment(config, state);
    else state.status = config.monitorDeployment === false ? "uploaded" : "current";
    state.failureCount = 0;
    delete state.error;
    await writeState(stateFile, state);
    console.log(`[${now()}] ${state.status} ${state.commit ?? ""}`);
    return state;
  } catch (error) {
    state.status = "error";
    state.error = error.message;
    state.failureCount = (state.failureCount ?? 0) + 1;
    state.failedAt = now();
    await writeState(stateFile, state);
    console.error(`[${now()}] Retry next minute: ${error.message}`);
    if (config.notify && state.failureCount >= 3 && (!state.notifiedAt || Date.now() - Date.parse(state.notifiedAt) > 24 * 60 * 60_000)) {
      await command("/usr/bin/osascript", ["-e", 'display notification "근무표 자동 업데이트가 실패했습니다. publish:status로 상태를 확인해 주세요." with title "반디근무 업데이트 오류"'], config.runtime).catch(() => {});
      state.notifiedAt = now();
      await writeState(stateFile, state);
    }
    throw error;
  } finally {
    if (job) await fs.rm(job, { recursive: true, force: true });
    await fs.rm(lock, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const watchdog = setTimeout(() => process.exit(1), 8 * 60_000);
  try {
    const config = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
    await syncOnce(config);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { clearTimeout(watchdog); }
}
