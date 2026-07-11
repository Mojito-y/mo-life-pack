import { cp, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const source = path.join(repoRoot, "skills", "mo-coach");
const targetRoot = path.join(os.homedir(), ".codex", "skills");
const target = path.join(targetRoot, "mo-coach");

async function exists(dir) {
  try {
    await stat(dir);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(source))) {
    throw new Error("Missing skills/mo-coach. Run the skill scaffold first.");
  }

  await mkdir(targetRoot, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
  process.stdout.write(`Installed Mo Coach skill to ${target}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

