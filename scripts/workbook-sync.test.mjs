import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { syncOnce } from "./workbook-sync.mjs";

test("sync retries unchanged saves after failure and publishes only the workbook", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bandihr-sync-test-"));
  const cmd = (cwd, bin, ...args) => execFileSync(bin, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    const seed = path.join(root, "seed");
    await fs.mkdir(path.join(seed, "xl"), { recursive: true });
    await fs.writeFile(path.join(seed, "xl/workbook.xml"), '<workbook><sheets><sheet name="26년 9월"/></sheets></workbook>');
    cmd(seed, "zip", "-q", "schedule.xlsx", "xl/workbook.xml");
    cmd(seed, "git", "init", "-b", "main");
    cmd(seed, "git", "add", "schedule.xlsx");
    cmd(seed, "git", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "seed");
    const remote = path.join(root, "remote.git");
    cmd(root, "git", "clone", "--bare", seed, remote);
    const source = path.join(root, "source.xlsx");
    await fs.copyFile(path.join(seed, "schedule.xlsx"), source);
    const config = { runtime: path.join(root, "runtime"), source, remote, workbookName: "schedule.xlsx", monitorDeployment: false, settleMs: 1 };
    const first = await syncOnce(config);
    assert.equal(first.status, "uploaded");
    assert.equal((await syncOnce(config)).commit, first.commit, "unchanged workbook must not create commits");
    await fs.writeFile(path.join(seed, "xl/workbook.xml"), '<workbook><sheets><sheet name="26년 9월 ver9"/></sheets></workbook>');
    cmd(seed, "zip", "-q", "schedule.xlsx", "xl/workbook.xml");
    await fs.copyFile(path.join(seed, "schedule.xlsx"), source);
    await assert.rejects(syncOnce({ ...config, remote: path.join(root, "offline.git") }));
    const failed = JSON.parse(await fs.readFile(path.join(config.runtime, "status.json")));
    assert.equal(failed.publishedHash, first.publishedHash, "failed upload cannot advance checkpoint");
    const retried = await syncOnce(config);
    assert.notEqual(retried.commit, first.commit, "retry must work without another file save");
    assert.equal(cmd(remote, "git", "diff-tree", "--no-commit-id", "--name-only", "-r", retried.commit), "schedule.xlsx");
    await fs.writeFile(source, "partially saved file");
    await assert.rejects(syncOnce(config));
    assert.equal(cmd(remote, "git", "rev-parse", "main"), retried.commit, "invalid file must not publish");
    await fs.mkdir(path.join(config.runtime, "lock"));
    assert.equal((await syncOnce(config)).status, "busy");
    await fs.rm(path.join(config.runtime, "lock"), { recursive: true });
    await fs.copyFile(path.join(seed, "schedule.xlsx"), source);
    const realFetch = globalThis.fetch;
    try {
      let liveHash = "stale";
      globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes("api.github.com")
        ? { workflow_runs: [{ path: ".github/workflows/deploy-bandihr-webapp.yml", status: "completed", conclusion: "success" }] }
        : { workbookSha256: liveHash }), { status: 200 });
      const monitored = { ...config, monitorDeployment: true, site: "https://example.test/" };
      await assert.rejects(syncOnce(monitored), /different workbook/);
      liveHash = retried.publishedHash;
      const deployed = await syncOnce(monitored);
      assert.equal(deployed.status, "current");
      assert.equal(deployed.deployedHash, retried.publishedHash);
      assert.equal(deployed.failureCount, 0);
      assert.equal(deployed.error, undefined);
    } finally { globalThis.fetch = realFetch; }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
