import fs from "node:fs/promises";
import { createHash } from "node:crypto";

const bytes = await fs.readFile("26년 근무표.xlsx");
await fs.writeFile("dist/version.json", JSON.stringify({
  commit: process.env.GITHUB_SHA ?? "local",
  workbookSha256: createHash("sha256").update(bytes).digest("hex"),
  builtAt: new Date().toISOString(),
}, null, 2) + "\n");
